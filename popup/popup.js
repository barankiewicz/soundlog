// popup/popup.js

// DOM Container Anchors
const appContainer = document.getElementById('app-container');

// A simple local state object to mimic our database state before full signals wiring
let localPendingReviews = [];

/**
 * Utility: Render the onboarding layout config dashboard view
 */
function renderSettingsView() {
  browser.storage.local.get({
    username: '',
    apiKey: '',
    matchingStrategy: 'hybrid'
  }).then(config => {
    appContainer.innerHTML = `
      <div style="padding: 4px 2px;">
        <h3 style="font-size:0.85rem; color:#ff5500; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.05em;">SoundLog Configuration</h3>
        
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:0.7rem; color:#a8a8b3; margin-bottom:4px; font-weight:bold;">LAST.FM USERNAME</label>
          <input type="text" id="cfg-username" style="width:100%; height:32px; background:#1a1a1e; color:#e1e1e6; border:1px solid #29292e; border-radius:4px; padding:0 8px; box-sizing:border-box;" placeholder="e.g., MusicNerd99" value="${config.username}">
        </div>
        
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:0.7rem; color:#a8a8b3; margin-bottom:4px; font-weight:bold;">LAST.FM API KEY</label>
          <input type="password" id="cfg-key" style="width:100%; height:32px; background:#1a1a1e; color:#e1e1e6; border:1px solid #29292e; border-radius:4px; padding:0 8px; box-sizing:border-box;" placeholder="Paste API Key..." value="${config.apiKey}">
        </div>

        <div style="margin-bottom:16px;">
          <label style="display:block; font-size:0.7rem; color:#a8a8b3; margin-bottom:4px; font-weight:bold;">ALBUM MATCHING STRATEGY</label>
          <select id="cfg-strategy" style="width:100%; height:32px; background:#1a1a1e; color:#e1e1e6; border:1px solid #29292e; border-radius:4px; padding:0 8px; box-sizing:border-box; cursor:pointer;">
            <option value="hybrid" ${config.matchingStrategy === 'hybrid' ? 'selected' : ''}>Hybrid Mode (Fast & Smart)</option>
            <option value="levenshtein" ${config.matchingStrategy === 'levenshtein' ? 'selected' : ''}>Levenshtein (Save Battery)</option>
            <option value="ai" ${config.matchingStrategy === 'ai' ? 'selected' : ''}>Local AI Engine Only (WASM)</option>
          </select>
        </div>

        <div id="historical-scan-section" style="background:#1a1a1e; border:1px solid #29292e; border-radius:4px; padding:12px; margin-bottom:16px; text-align: left;">
          <p style="font-size: 0.75rem; color: #a8a8b3; margin: 0 0 10px 0; line-height:1.4; text-align: center;">Backfill your queue from your Last.fm listening history:</p>
          
          <div style="margin-bottom:10px;">
            <label style="display:block; font-size:0.65rem; color:#a8a8b3; margin-bottom:4px; font-weight:bold;">SCAN DEPTH TIMELINE</label>
            <select id="scan-depth" style="width:100%; height:28px; background:#121214; color:#e1e1e6; border:1px solid #29292e; border-radius:4px; padding:0 6px; font-size:0.75rem; cursor:pointer;">
              <option value="1">Past 1 Year</option>
              <option value="2">Past 2 Years</option>
              <option value="5">Past 5 Years</option>
              <option value="all">Lifetime History (All Pages)</option>
            </select>
          </div>

          <button id="historical-scan-btn" style="background:#29292e; color:#e1e1e6; border:1px solid #3e3e44; padding:6px 12px; font-size:0.75rem; border-radius:4px; cursor:pointer; width:100%; font-weight:bold;">
            Scan Historical Scrobbles
          </button>
          <div id="scan-status" style="font-size: 0.75rem; color: #ff5500; margin-top: 8px; font-weight:500; line-height:1.3; display: none; text-align: center;"></div>
        </div>

        <button id="save-config-btn" style="background:#ff5500; color:#ffffff; border:none; border-radius:4px; height:36px; width:100%; font-weight:bold; cursor:pointer; transition:background 0.2s;">
          Save & View Queue
        </button>
      </div>
    `;
  });
}

/**
 * Utility: Fetch current data from our CRDT store and render the active cards
 */
async function loadAndRenderQueueView() {
  try {
    // Dynamically import the DB state file to check current queue items
    const db = await import('../src/store/crdt-db.js');
    
    // Fallback pattern if getQueue is still being initialized
    localPendingReviews = typeof db.readFreshAlbumQueue === 'function' ? await db.readFreshAlbumQueue() : [];
    
    renderQueueView();
  } catch (err) {
    console.error("Failed to read from CRDT database, defaulting to empty state:", err);
    renderQueueView();
  }
}

/**
 * Utility: Render the active user queue deck grid layout
 */
function renderQueueView() {
  if (!localPendingReviews || localPendingReviews.length === 0) {
    appContainer.innerHTML = `
      <div style="text-align:center; padding:40px 20px;">
        <p style="color:#a8a8b3; font-size:0.85rem; margin-bottom:16px;">Your SoundLog review queue is currently empty.</p>
        <button id="nav-to-settings" style="background:transparent; color:#ff5500; border:1px solid #ff5500; border-radius:4px; padding:6px 12px; font-size:0.75rem; cursor:pointer; font-weight:bold;">
          Open Settings
        </button>
      </div>
    `;
    return;
  }

  let cardsHtml = `<div id="queue-list" style="display:flex; flex-direction:column; gap:12px; max-height:480px; overflow-y:auto; padding-right:4px;">`;
  
  localPendingReviews.forEach((item, index) => {
    cardsHtml += `
      <div class="album-card" style="background:#1a1a1e; border:1px solid #29292e; border-radius:6px; padding:12px; box-sizing:border-box;">
        <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:8px;">
          <div style="flex:1;">
            <h4 style="margin:0; font-size:0.85rem; color:#e1e1e6; line-height:1.3;">${item.album}</h4>
            <p style="margin:2px 0 0 0; font-size:0.75rem; color:#a8a8b3;">${item.artist}</p>
          </div>
          <span style="font-size:0.65rem; background:#29292e; color:#ff5500; padding:2px 6px; border-radius:10px; font-weight:bold; margin-left:8px;">
            ${item.uniqueTrackCount || '5'} tracks
          </span>
        </div>
        <textarea class="review-notes" data-index="${index}" style="width:100%; height:50px; background:#121214; color:#e1e1e6; border:1px solid #29292e; border-radius:4px; padding:6px; box-sizing:border-box; font-family:inherit; font-size:0.75rem; resize:none; margin-bottom:8px;" placeholder="Write brief thoughts/critique notes here..."></textarea>
        <button class="open-rym-btn" data-index="${index}" style="background:#ff5500; color:#ffffff; border:none; border-radius:4px; height:26px; font-size:0.7rem; font-weight:bold; width:100%; cursor:pointer;">
          Copy Notes & Rate on RYM
        </button>
      </div>
    `;
  });

  cardsHtml += `</div>`;
  cardsHtml += `
    <div style="margin-top:12px; text-align:right;">
      <button id="nav-to-settings" style="background:transparent; color:#a8a8b3; border:none; font-size:0.7rem; cursor:pointer; text-decoration:underline;">
        Settings
      </button>
    </div>
  `;
  
  appContainer.innerHTML = cardsHtml;
}

/**
 * Direct Global Router Routing Initializer
 */
function initViewRouter() {
  if (!appContainer) return;

  browser.storage.local.get(['username', 'apiKey']).then(config => {
    if (!config.username || !config.apiKey) {
      renderSettingsView();
    } else {
      loadAndRenderQueueView();
    }
  }).catch(() => {
    renderSettingsView();
  });
}

/**
 * Main Event Delegation Tree Mapping Logic
 */
document.body.addEventListener('click', async (e) => {
  if (e.target && e.target.id === 'nav-to-settings') {
    renderSettingsView();
    return;
  }

  if (e.target && e.target.id === 'save-config-btn') {
    const usernameInput = document.getElementById('cfg-username').value.trim();
    const apiKeyInput = document.getElementById('cfg-key').value.trim();
    const strategySelect = document.getElementById('cfg-strategy').value;

    if (!usernameInput || !apiKeyInput) {
      alert("Username and API key are required.");
      return;
    }

    browser.storage.local.set({
      username: usernameInput,
      apiKey: apiKeyInput,
      matchingStrategy: strategySelect
    }).then(() => {
      initViewRouter();
    });
    return;
  }

  if (e.target && e.target.id === 'historical-scan-btn') {
    const statusDiv = document.getElementById('scan-status');
    const scanBtn = document.getElementById('historical-scan-btn');
    const depthSelect = document.getElementById('scan-depth').value;
    
    scanBtn.disabled = true;
    statusDiv.style.display = "block";
    statusDiv.innerText = "Connecting to background scan...";

    try {
      const backgroundWindow = await browser.runtime.getBackgroundPage();
      
      if (!backgroundWindow || typeof backgroundWindow.runHistoricalScan !== 'function') {
        statusDiv.innerText = "Error: Background scan routine unavailable.";
        scanBtn.disabled = false;
        return;
      }

      statusDiv.innerText = "Scan starting...";
      
      // Pass depthSelect value straight through the window boundary parameters
      const status = await backgroundWindow.runHistoricalScan(depthSelect, (progress) => {
        statusDiv.innerText = `Processing page ${progress.page}/${progress.totalPages || '?'}\nFound ${progress.totalAlbumsFound} albums.`;
      });

      if (status && status.success) {
        statusDiv.style.color = "#04d361";
        statusDiv.innerText = `Complete! Loaded ${status.totalAlbumsFound} legacy albums into your queue.`;
        setTimeout(() => { initViewRouter(); }, 1500);
      } else {
        statusDiv.style.color = "#ff3333";
        statusDiv.innerText = `Scan aborted: ${status ? status.error : 'Unknown error'}`;
        scanBtn.disabled = false;
      }
    } catch (err) {
      statusDiv.innerText = "Connection to background script failed.";
      scanBtn.disabled = false;
    }
    return;
  }
  if (e.target && e.target.classList.contains('open-rym-btn')) {
    const idx = parseInt(e.target.getAttribute('data-index'), 10);
    const targetCard = localPendingReviews[idx];
    
    const txtArea = document.querySelector(`textarea[data-index="${idx}"]`);
    const noteText = txtArea ? txtArea.value.trim() : "";

    if (noteText) {
      await navigator.clipboard.writeText(noteText);
      console.log("Notes copied to clipboard.");
    }

    const rymSearchUrl = `https://rateyourmusic.com/search?searchterm=${encodeURIComponent(targetCard.artist + ' ' + targetCard.album)}&searchtype=l`;
    browser.tabs.create({ url: rymSearchUrl });

    try {
      const db = await import('../src/store/crdt-db.js');
      if (typeof db.removeFreshAlbumFromQueue === 'function') {
        await db.removeFreshAlbumFromQueue(targetCard.artist, targetCard.album);
      }
      loadAndRenderQueueView(); 
    } catch (err) {
      console.error("Could not remove album from database:", err);
    }
  }
});

// Run router on load
initViewRouter();