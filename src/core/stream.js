// src/core/stream.js
import '../libs/rxjs.umd.min.js';

export function aggregateLastFmStream(rawTracks, minThreshold = 5) {
  return new Promise((resolve) => {
    const rxjsEngine = globalThis.rxjs;
    if (!rxjsEngine) {
      console.error("RxJS engine could not be resolved from global background execution context.");
      resolve([]);
      return;
    }

    const { from, operators: { groupBy, mergeMap, toArray, filter, map } } = rxjsEngine;
    const qualifiedAlbums = [];

    from(rawTracks)
      .pipe(
        filter(track => track.album && track.album['#text'] && track.date),
        groupBy(track => `${track.artist['#text']}|||${track.album['#text']}`),
        mergeMap(group$ => 
          group$.pipe(
            toArray(),
            map(tracks => {
              const uniqueTracks = new Set(tracks.map(t => t.name));
              return {
                artist: tracks[0].artist['#text'],
                album: tracks[0].album['#text'],
                uniqueTrackCount: uniqueTracks.size,
                latestTimestamp: Math.max(...tracks.map(t => parseInt(t.date.uts) * 1000))
              };
            })
          )
        ),
        filter(summary => summary.uniqueTrackCount >= minThreshold)
      )
      .subscribe({
        next: (album) => qualifiedAlbums.push(album),
        complete: () => resolve(qualifiedAlbums)
      });
  });
}