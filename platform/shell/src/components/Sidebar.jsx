import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTools } from '../context/ToolRegistry';

const FAVORITES_KEY = 'cybertools_favorites';

function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveFavorites(ids) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
}

const styles = {
  sidebar: {
    width: '220px',
    background: 'var(--bg-sidebar)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflow: 'hidden',
  },
  filterArea: {
    padding: '12px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  chip: (active) => ({
    padding: '3px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    cursor: 'pointer',
    border: `1px solid ${active ? 'var(--text-primary)' : 'var(--border)'}`,
    background: active ? 'var(--btn-primary-bg)' : 'transparent',
    color: active ? 'var(--btn-primary-text)' : 'var(--text-muted)',
  }),
  toolList: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 0',
  },
  sectionLabel: {
    padding: '8px 12px 4px',
    fontSize: '10px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  toolRow: (active, comingSoon) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    cursor: comingSoon ? 'default' : 'pointer',
    background: active ? 'var(--bg-surface)' : 'transparent',
    borderLeft: active ? '2px solid var(--text-primary)' : '2px solid transparent',
    opacity: comingSoon ? 0.4 : 1,
  }),
  toolName: {
    fontSize: '12px',
    color: 'var(--text-primary)',
  },
  starBtn: (favorited) => ({
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: favorited ? 'var(--text-primary)' : 'var(--border)',
    fontSize: '14px',
    lineHeight: 1,
    padding: '0 0 0 8px',
  }),
};

export function Sidebar() {
  const tools = useTools();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeFilters, setActiveFilters] = useState([]);
  const [favorites, setFavorites] = useState(loadFavorites);

  useEffect(() => {
    saveFavorites(favorites);
  }, [favorites]);

  const allTags = [...new Set(tools.flatMap(t => t.tags || []))].sort();

  const toggleFilter = (tag) => {
    setActiveFilters(f => f.includes(tag) ? f.filter(t => t !== tag) : [...f, tag]);
  };

  const toggleFavorite = (e, id) => {
    e.stopPropagation();
    setFavorites(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id]);
  };

  const visibleTools = activeFilters.length === 0
    ? tools
    : tools.filter(t => activeFilters.some(f => (t.tags || []).includes(f)));

  const favoriteTools = visibleTools.filter(t => favorites.includes(t.id));
  const otherTools = visibleTools.filter(t => !favorites.includes(t.id));

  function ToolRow({ tool }) {
    const isActive = location.pathname === tool.route;
    const isFavorite = favorites.includes(tool.id);
    const isComingSoon = tool.status === 'coming-soon';
    return (
      <div
        style={styles.toolRow(isActive, isComingSoon)}
        onClick={() => !isComingSoon && navigate(tool.route)}
        title={isComingSoon ? 'Coming Soon' : tool.description}
      >
        <span style={styles.toolName}>{tool.name}</span>
        <button style={styles.starBtn(isFavorite)} onClick={(e) => toggleFavorite(e, tool.id)}>
          {isFavorite ? '★' : '☆'}
        </button>
      </div>
    );
  }

  return (
    <aside style={styles.sidebar}>
      <div style={styles.filterArea}>
        {allTags.map(tag => (
          <span
            key={tag}
            style={styles.chip(activeFilters.includes(tag))}
            onClick={() => toggleFilter(tag)}
          >
            {tag}
          </span>
        ))}
      </div>
      <div style={styles.toolList}>
        {favoriteTools.length > 0 && (
          <>
            <div style={styles.sectionLabel}>Favorites</div>
            {favoriteTools.map(t => <ToolRow key={t.id} tool={t} />)}
            <div style={{ ...styles.sectionLabel, marginTop: '8px' }}>All Tools</div>
          </>
        )}
        {otherTools.map(t => <ToolRow key={t.id} tool={t} />)}
      </div>
    </aside>
  );
}
