import React, { useState, useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';
import MediaCard from './components/MediaCard';
import DetailModal from './components/DetailModal';
import SearchModal from './components/SearchModal';
import './index.css';

const SOCKET_URL = 'http://localhost:5000';

function App() {
  const [library, setLibrary] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [genreFilter, setGenreFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [selectedItem, setSelectedItem] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchItem, setSearchItem] = useState(null); // for manual TMDB search
  const [confirmHide, setConfirmHide] = useState(null); // for delete confirmation

  useEffect(() => {
    fetch(`${SOCKET_URL}/api/library`)
      .then(res => res.json())
      .then(data => setLibrary(data))
      .catch(err => console.error("Failed to fetch library", err));

    const socket = io(SOCKET_URL);
    socket.on('library_update', (newLibrary) => {
      setLibrary(newLibrary);
      setSelectedItem(prev => prev ? newLibrary.find(i => i.id === prev.id) || null : null);
      setIsRefreshing(false);
    });

    return () => socket.disconnect();
  }, []);

  const handlePlay = (filePath) => {
    fetch(`${SOCKET_URL}/api/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath })
    }).catch(err => console.error("Failed to play", err));
  };

  const handleToggleWatched = (id, filePath, watched) => {
    fetch(`${SOCKET_URL}/api/watched`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, path: filePath, watched })
    }).catch(err => console.error("Failed to update status", err));
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetch(`${SOCKET_URL}/api/refresh`, { method: 'POST' })
      .catch(err => { console.error(err); setIsRefreshing(false); });
  };

  const handleHideConfirm = (item) => {
    setConfirmHide(item);
  };

  const handleHideExecute = () => {
    if (!confirmHide) return;
    fetch(`${SOCKET_URL}/api/hide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: confirmHide.id })
    }).catch(err => console.error(err));
    setConfirmHide(null);
    setSelectedItem(null);
  };

  const handleMatch = (libraryId, tmdbId, type) => {
    fetch(`${SOCKET_URL}/api/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ libraryId, tmdbId, type })
    }).catch(err => console.error(err));
  };

  // Analytics
  const analytics = useMemo(() => {
    let movies = 0, shows = 0, episodes = 0;
    const allGenres = new Set();
    library.forEach(item => {
      if (item.type === 'movie') movies++;
      if (item.type === 'tv') {
        shows++;
        episodes += (item.episodes || []).length;
      }
      if (item.metadata?.genres) item.metadata.genres.forEach(g => allGenres.add(g));
    });
    return { movies, shows, episodes, availableGenres: Array.from(allGenres).sort() };
  }, [library]);

  const processedLibrary = useMemo(() => {
    let filtered = library.filter(item => {
      const title = item.metadata?.title || item.originalName;
      const matchesSearch = title.toLowerCase().includes(search.toLowerCase());
      const matchesFilter = filter === 'all' || item.type === filter;
      const matchesGenre = genreFilter === 'all' || (item.metadata?.genres && item.metadata.genres.includes(genreFilter));
      return matchesSearch && matchesFilter && matchesGenre;
    });

    return filtered.sort((a, b) => {
      if (sort === 'newest') return new Date(b.addedAt) - new Date(a.addedAt);
      if (sort === 'az') return (a.metadata?.title || a.originalName).localeCompare(b.metadata?.title || b.originalName);
      if (sort === 'rating') return (b.metadata?.rating || 0) - (a.metadata?.rating || 0);
      return 0;
    });
  }, [library, search, filter, sort, genreFilter]);

  return (
    <div className="app-container">
      <header>
        <h1>My Local Screen</h1>
        <p>I Solemnly Swear That I Am Up to No Good</p>
        <div className="header-line"></div>

        <div className="analytics-bar">
          <div className="stat-pill">🎬 <span>{analytics.movies}</span> Movies</div>
          <div className="stat-pill">📺 <span>{analytics.shows}</span> TV Shows</div>
          <div className="stat-pill">🎞️ <span>{analytics.episodes}</span> Episodes</div>
          <button className="btn-gold" onClick={handleRefresh} disabled={isRefreshing}>
            {isRefreshing ? '✨ Scanning...' : '🔄 Force Rescan'}
          </button>
        </div>
        
        <div className="controls-bar">
          <input 
            type="text" 
            placeholder="Search your library..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
          
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="select-dropdown">
            <option value="all">All Media</option>
            <option value="movie">Movies</option>
            <option value="tv">TV Shows</option>
          </select>

          <select value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)} className="select-dropdown">
            <option value="all">All Genres</option>
            {analytics.availableGenres.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>

          <select value={sort} onChange={(e) => setSort(e.target.value)} className="select-dropdown">
            <option value="newest">Newest Added</option>
            <option value="az">A — Z</option>
            <option value="rating">Highest Rated</option>
          </select>
        </div>
      </header>

      <div className="media-grid">
        {processedLibrary.map(item => (
          <MediaCard 
            key={item.id} 
            item={item} 
            onClick={setSelectedItem} 
            onToggleWatched={handleToggleWatched}
            onHide={handleHideConfirm}
          />
        ))}
      </div>

      {processedLibrary.length === 0 && (
        <div className="empty-state">
          <h2>The Map Reveals Nothing</h2>
          <p>No media found. Try clearing your filters or hit Force Rescan.</p>
        </div>
      )}

      {selectedItem && (
        <DetailModal 
          item={selectedItem} 
          onClose={() => setSelectedItem(null)} 
          onPlay={handlePlay}
          onToggleWatched={handleToggleWatched}
          onHide={handleHideConfirm}
          onOpenSearch={setSearchItem}
        />
      )}

      {searchItem && (
        <SearchModal
          item={searchItem}
          onClose={() => setSearchItem(null)}
          onMatch={handleMatch}
        />
      )}

      {confirmHide && (
        <div className="confirm-overlay" onClick={() => setConfirmHide(null)}>
          <div className="confirm-box" onClick={e => e.stopPropagation()}>
            <h3>Remove from Library?</h3>
            <p>This will hide <strong>{confirmHide.metadata?.title || confirmHide.originalName}</strong> from your website. The local file will NOT be deleted.</p>
            <div className="btn-row">
              <button className="btn-gold" onClick={() => setConfirmHide(null)}>Cancel</button>
              <button className="btn-danger" onClick={handleHideExecute}>🗑️ Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
