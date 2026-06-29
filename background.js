// background.js

// 1. FORCED GLOBAL EXPOSURE HOOKS (Put this at the very top of the file)
// This guarantees that the second this file is evaluated, the functions land on the window object
if (typeof window !== 'undefined') {
  window.runIngestPipeline = runIngestPipeline;
  window.runHistoricalScan = runHistoricalScan;
  window.runMatchTest = runMatchTest;
}
if (typeof globalThis !== 'undefined') {
  globalThis.runIngestPipeline = runIngestPipeline;
  globalThis.runHistoricalScan = runHistoricalScan;
  globalThis.runMatchTest = runMatchTest;
}

// Deliberate, opt-in entry point for the AI matcher. The queue's de-duplication
// stays text-only, so this is the only place the embedding model runs. Pick a
// strategy in the popup, then from the background console:
//   await runMatchTest("The Glow Pt. 2", "The Glow, Part II (Remastered)")
async function runMatchTest(a, b) {
  const { verifyMatchConfidence } = await import('./src/core/matcher-router.js');
  const score = await verifyMatchConfidence(a, b);
  console.log(`Match confidence "${a}" <-> "${b}": ${(score * 100).toFixed(1)}%`);
  return score;
}

// Core execution function
async function runIngestPipeline() {
  console.log("Starting background ingestion...");
  try {
    const config = await browser.storage.local.get(['username', 'apiKey']);
    if (!config.username || !config.apiKey) {
      console.warn("Username or API key missing in storage.");
      return;
    }

    const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(config.username)}&api_key=${encodeURIComponent(config.apiKey)}&format=json&limit=50`;
    console.log("Fetching recent tracks from Last.fm...");

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

    const data = await response.json();
    const rawTracks = data.recenttracks?.track || [];
    console.log(`Retrieved ${rawTracks.length} tracks.`);

    if (rawTracks.length === 0) return;

    // Dynamically import our processing dependencies inside the execution block
    const { aggregateLastFmStream } = await import('./src/core/stream.js');
    const { syncAlbumToCRDT } = await import('./src/store/crdt-db.js');

    const qualifiedAlbums = await aggregateLastFmStream(rawTracks, 5);
    console.log(`Found ${qualifiedAlbums.length} qualified albums.`);

    for (const albumCard of qualifiedAlbums) {
      await syncAlbumToCRDT(albumCard);
    }
    console.log("Ingestion complete.");
  } catch (error) {
    console.error("Ingestion failed:", error);
  }
}

// Historical scan function
// Historical scan function with duration limit constraints
async function runHistoricalScan(yearsDepth, progressCallback) {
  const config = await browser.storage.local.get(['username', 'apiKey']);
  if (!config.username || !config.apiKey) return { success: false, error: "Missing config" };

  let page = 1;
  let totalPages = 1;
  let totalAlbumsFound = 0;

  // Calculate cutoff Unix timestamp parameter if a user specifies years
  let timeLimitParam = "";
  if (yearsDepth !== "all") {
    const numYears = parseInt(yearsDepth, 10) || 1;
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - numYears);
    const unixTimestamp = Math.floor(cutoffDate.getTime() / 1000);
    
    // Last.fm endpoint accepts 'from' to scan a specific historical slot window
    timeLimitParam = `&from=${unixTimestamp}`;
    console.log(`Setting historical time constraints filter window back to: ${cutoffDate.toDateString()}`);
  }

  do {
    if (typeof progressCallback === 'function') {
      progressCallback({ page, totalPages, totalAlbumsFound });
    }

    // Append the timeLimitParam explicitly to the endpoint string query sequence
    const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(config.username)}&api_key=${encodeURIComponent(config.apiKey)}&format=json&limit=200&page=${page}${timeLimitParam}`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) break;
      
      const data = await response.json();
      const recenttracks = data.recenttracks;
      if (!recenttracks) break;

      totalPages = parseInt(recenttracks['@attr'].totalPages, 10) || 1;
      const tracks = recenttracks.track || [];
      if (tracks.length === 0) break;

      const { aggregateLastFmStream } = await import('./src/core/stream.js');
      const { syncAlbumToCRDT } = await import('./src/store/crdt-db.js');

      const qualifiedAlbums = await aggregateLastFmStream(tracks, 5);
      for (const albumCard of qualifiedAlbums) {
        await syncAlbumToCRDT(albumCard);
        totalAlbumsFound++;
      }
      page++;
      await new Promise(resolve => setTimeout(resolve, 250));
    } catch (err) {
      return { success: false, error: err.message };
    }
  } while (page <= totalPages);

  return { success: true, totalAlbumsFound };
}



// Alarm schedules
browser.alarms.create('soundlog-polling-alarm', { periodInMinutes: 15 });
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'soundlog-polling-alarm') runIngestPipeline();
});
browser.runtime.onInstalled.addListener(() => {
  runIngestPipeline();
});

console.log("background.js loaded.");