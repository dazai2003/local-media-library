import React, { useState } from 'react';

const DetailModal = ({ item, onClose, onPlay, onToggleWatched, onHide, onOpenSearch }) => {
  const [playingItem, setPlayingItem] = useState(null);
  const [downloadingSubs, setDownloadingSubs] = useState(false);
  const [subsStatus, setSubsStatus] = useState('');

  if (!item) return null;

  const handleDownloadSubtitles = async () => {
    setDownloadingSubs(true);
    setSubsStatus('');
    let paths = [];
    if (type === 'tv' && item.episodes) {
      paths = item.episodes.map(ep => ep.path);
    } else if (type === 'movie' && item.path) {
      paths = [item.path];
    }
    
    try {
      const res = await fetch('http://localhost:5000/api/subtitles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths })
      });
      const data = await res.json();
      if (data.success) {
        setSubsStatus('✅ Found Extracted!');
      } else {
        setSubsStatus('❌ Failed to find subs');
      }
    } catch (err) {
      setSubsStatus('❌ Error Connection');
    }
    setDownloadingSubs(false);
    setTimeout(() => setSubsStatus(''), 5000);
  };

  const { type, originalName, metadata = null, episodes } = item;
  
  const title = metadata?.title || originalName;
  const poster = metadata?.posterUrl || 'https://via.placeholder.com/500x750/15152a/c9a84c?text=No+Poster';
  const backdrop = metadata?.backdropUrl || null;
  const overview = metadata?.overview || 'No description available for this file.';
  const rating = metadata?.rating ? metadata.rating.toFixed(1) : 'NR';
  const cast = metadata?.cast || [];
  const genres = metadata?.genres || [];
  
  const isShow = type === 'tv';

  const seasons = {};
  if (isShow && episodes) {
    episodes.forEach(ep => {
      if (!seasons[ep.season]) seasons[ep.season] = [];
      seasons[ep.season].push(ep);
    });
    Object.keys(seasons).forEach(s => {
      seasons[s].sort((a, b) => a.episode - b.episode);
    });
  }

  const handlePlay = (path) => {
    setPlayingItem(path);
    onPlay(path);
    setTimeout(() => setPlayingItem(null), 3000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>✕</button>
        
        <div className="modal-hero">
          {backdrop ? (
            <img src={backdrop} alt="Backdrop" className="modal-backdrop-img" />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1a1a3e, #0a0a12)' }} />
          )}
          <div className="modal-hero-overlay"></div>
        </div>

        <div className="modal-body">
          <img src={poster} alt={title} className="modal-poster" />
          
          <div className="modal-info">
            <h2 className="modal-title">{title}</h2>
            
            <div className="modal-meta">
              <span className="rating-badge">★ {rating}</span>
              {metadata?.releaseDate && <span>{new Date(metadata.releaseDate).getFullYear()}</span>}
              {isShow && episodes && <span>{episodes.length} Episodes</span>}
            </div>

            {genres.length > 0 && (
              <div className="genre-tags">
                {genres.map(g => <span key={g} className="genre-tag">{g}</span>)}
              </div>
            )}

            <p className="modal-overview">{overview}</p>
            
            {cast.length > 0 && (
              <div className="modal-cast">
                <h3>Cast</h3>
                <div className="cast-grid">
                  {cast.map((c, i) => (
                    <div key={i} className="cast-card">
                      {c.profileUrl ? (
                        <img src={c.profileUrl} alt={c.name} className="cast-photo" />
                      ) : (
                        <div className="cast-photo" style={{ background: 'linear-gradient(135deg, #1a1a3e, #2d1b69)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>🧙</div>
                      )}
                      <span className="cast-name">{c.name}</span>
                      {c.character && <span className="cast-role">{c.character}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="modal-actions">
              {!isShow && (
                <button 
                  className={`play-btn ${playingItem ? 'playing' : ''}`} 
                  onClick={() => handlePlay(item.path)}
                >
                  {playingItem ? '▶ Opening Player...' : '▶ Play Locally'}
                </button>
              )}
              <button 
                className={`btn-gold ${downloadingSubs ? 'playing' : ''}`} 
                onClick={handleDownloadSubtitles} 
                disabled={downloadingSubs}
                style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}
              >
                {downloadingSubs ? '⏳ Searching...' : subsStatus ? subsStatus : '💬 Find Best EN Subs'}
              </button>
              <button className="btn-gold" onClick={() => onOpenSearch(item)} style={{ fontSize: '0.85rem' }}>
                🔍 Fix Match
              </button>
              <button className="btn-danger" onClick={() => { onHide(item); onClose(); }}>
                🗑️ Remove
              </button>
            </div>
          </div>
        </div>

        {isShow && Object.keys(seasons).length > 0 && (
          <div className="episodes-section">
            <h3 className="episodes-header">Episodes</h3>
            {Object.keys(seasons).sort((a, b) => Number(a) - Number(b)).map(seasonKey => (
              <div key={seasonKey} className="season-container">
                <h4 className="season-title">Season {seasonKey}</h4>
                <div className="episodes-grid">
                  {seasons[seasonKey].map(ep => (
                    <div key={ep.id} className={`episode-card ${ep.watched ? 'watched' : ''}`}>
                      <div className="episode-info">
                        <span className="episode-number">E{String(ep.episode).padStart(2, '0')}</span>
                        <span className="episode-name">{ep.filename}</span>
                      </div>
                      <div className="episode-actions">
                        <button
                           className="watch-toggle-btn"
                           onClick={() => onToggleWatched(item.id, ep.path, !ep.watched)}
                           title={ep.watched ? "Mark Unwatched" : "Mark Watched"}
                        >
                           {ep.watched ? '👁️' : '🕶️'}
                        </button>
                        <button 
                          className={`btn-icon ${playingItem === ep.path ? 'playing' : ''}`}
                          onClick={() => handlePlay(ep.path)}
                          title="Play"
                        >
                          ▶
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DetailModal;
