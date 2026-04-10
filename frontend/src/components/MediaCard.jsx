import React from 'react';

const MediaCard = ({ item, onClick, onToggleWatched, onHide }) => {
  const { type, metadata = null, originalName, watched } = item;
  
  const title = metadata?.title || originalName;
  const poster = metadata?.posterUrl || 'https://via.placeholder.com/500x750/15152a/c9a84c?text=No+Poster';
  const displayGenres = metadata?.genres ? metadata.genres.slice(0, 2).join(' · ') : '';

  const isShow = type === 'tv';
  
  let tvWatchedText = '';
  let isFullyWatched = false;
  if (isShow && item.episodes) {
    const totalEps = item.episodes.length;
    const watchedEps = item.episodes.filter(e => e.watched).length;
    tvWatchedText = `${watchedEps}/${totalEps} Watched`;
    isFullyWatched = totalEps > 0 && watchedEps === totalEps;
  } else {
    isFullyWatched = watched === true;
  }

  const handleWatchedClick = (e) => {
    e.stopPropagation();
    if (!isShow) onToggleWatched(item.id, null, !watched);
  };

  const handleHideClick = (e) => {
    e.stopPropagation();
    onHide(item);
  };

  return (
    <div className={`media-card ${isFullyWatched ? 'watched' : ''}`} onClick={() => onClick(item)}>
      <img src={poster} alt={title} className="poster-img" style={isFullyWatched ? { opacity: 0.5, filter: 'saturate(0.4)' } : {}} />
      <div className="card-overlay">
        <div className="card-actions">
          <span className="card-type">{isShow ? 'TV Show' : 'Movie'}</span>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            {!isShow && (
              <button className="watch-toggle-btn" onClick={handleWatchedClick} title={watched ? "Unwatched" : "Watched"}>
                {watched ? '👁️' : '🕶️'}
              </button>
            )}
            <button className="hide-btn" onClick={handleHideClick} title="Remove from library">✕</button>
          </div>
        </div>
        <h3 className="card-title">{title}</h3>
        {displayGenres && <span className="card-genre">{displayGenres}</span>}
        {isShow && <span className="card-subtitle">{tvWatchedText}</span>}
      </div>
    </div>
  );
};

export default MediaCard;
