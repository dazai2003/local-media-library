import React, { useState } from 'react';

const SearchModal = ({ item, onClose, onMatch }) => {
  const [query, setQuery] = useState(item?.originalName || '');
  const [searchType, setSearchType] = useState(item?.type || 'movie');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:5000/api/search-tmdb?query=${encodeURIComponent(query)}&type=${searchType}`);
      const data = await res.json();
      setResults(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleSelect = (result) => {
    onMatch(item.id, result.tmdbId, searchType);
    onClose();
  };

  return (
    <div className="search-modal-backdrop" onClick={onClose}>
      <div className="search-modal-content" onClick={e => e.stopPropagation()}>
        <h2>🔍 Manual TMDB Search</h2>
        <p style={{ color: '#9e978a', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Search for the correct movie or TV show to match with <strong style={{ color: '#c9a84c' }}>{item?.metadata?.title || item?.originalName}</strong>
        </p>
        
        <div className="search-modal-controls">
          <input 
            type="text" 
            value={query} 
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a title..."
          />
          <select 
            className="select-dropdown" 
            value={searchType} 
            onChange={(e) => setSearchType(e.target.value)}
            style={{ borderRadius: '8px' }}
          >
            <option value="movie">Movie</option>
            <option value="tv">TV Show</option>
          </select>
          <button className="btn-gold" onClick={handleSearch} disabled={loading}>
            {loading ? '...' : 'Search'}
          </button>
        </div>

        <div>
          {results.length === 0 && !loading && (
            <p style={{ textAlign: 'center', color: '#9e978a', padding: '2rem 0' }}>Enter a title and click Search</p>
          )}
          {results.map(r => (
            <div key={r.tmdbId} className="search-result" onClick={() => handleSelect(r)}>
              {r.posterUrl ? <img src={r.posterUrl} alt={r.title} /> : <div style={{ width: 50, height: 75, background: '#15152a', borderRadius: 4 }} />}
              <div className="search-result-info">
                <h4>{r.title} {r.releaseDate ? `(${new Date(r.releaseDate).getFullYear()})` : ''}</h4>
                <p>★ {r.rating?.toFixed(1)} — {r.overview || 'No description'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SearchModal;
