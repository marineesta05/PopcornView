import React, { useEffect, useState } from 'react';
import AdminHeader from './AdminHeader';

const API = process.env.REACT_APP_API_URL || 'http://localhost:4000';
const FRONTEND_TMDB_KEY = process.env.REACT_APP_TMDB_API_KEY || '';

export default function AdminMovies() {
  const [films, setFilms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [tmdbMode, setTmdbMode] = useState('popular'); 
  const [tmdbQuery, setTmdbQuery] = useState('');
  const [tmdbResults, setTmdbResults] = useState([]);
  const [tmdbPage, setTmdbPage] = useState(1);
  const [tmdbTotalPages, setTmdbTotalPages] = useState(1);
  const [tmdbSuggestions, setTmdbSuggestions] = useState([]);
  const [backendHasKey, setBackendHasKey] = useState(null); 
  const [deletedFilms, setDeletedFilms] = useState([]);

  useEffect(() => { fetchFilms(); fetchDeletedFilms(); }, []);

  useEffect(() => { fetchPopular(1); }, []);

  useEffect(() => { fetchPopular(tmdbPage); }, [tmdbPage]);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    async function checkHealth() {
      attempts++;
      try {
        const res = await fetch(`${API}/api/health`);
        if (!res.ok) throw new Error('health check failed');
        const data = await res.json();
        if (cancelled) return;
        setBackendHasKey(!!data.tmdb_key_present);
        if (data.tmdb_key_present) {
          setMessage('');
          try { if (!cancelled) await fetchPopular(1); } catch (e) {  }
        } else {
          if (FRONTEND_TMDB_KEY) {
            try { if (!cancelled) await fetchPopular(1); } catch (e) {  }
          } else {
            setMessage('Warning: No TMDB key on backend');
          }
        }
      } catch (err) {
        if (cancelled) return;
        setBackendHasKey(false);
        if (FRONTEND_TMDB_KEY) {
          try { if (!cancelled) await fetchPopular(1); } catch (e) {  }
        } else {
          setMessage('Warning: No TMDB key on backend');
        }
      }

      if (!cancelled && attempts < 10 && !backendHasKey) {
        setTimeout(checkHealth, 3000);
      }
    }

    checkHealth();
    return () => { cancelled = true; };
  }, []);

  async function fetchFilms() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/films`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setFilms(data || []);
    } catch (err) {
      setMessage('Failed to load films: ' + String(err.message || err));
    } finally { setLoading(false); }
  }

  async function fetchDeletedFilms() {
    try {
      const res = await fetch(`${API}/api/films/deleted`);
      if (!res.ok) return setDeletedFilms([]);
      const data = await res.json();
      setDeletedFilms(data || []);
    } catch (e) {
      setDeletedFilms([]);
    }
  }

  async function fetchPopular(page = 1) {
    setLoading(true);
    try {
      const data = await tmdbFetch('popular', { page });
      setTmdbResults(data.results || []);
      setTmdbPage(data.page || 1);
      setTmdbTotalPages(data.total_pages || 1);
    } catch (err) {
      setMessage('Failed to load popular movies: ' + String(err.message || err));
    } finally { setLoading(false); }
  }

  async function searchTmdb(q, page = 1) {
    if (!q) return setTmdbResults([]);
    setLoading(true);
    try {
      const data = await tmdbFetch('search', { q, page });
      setTmdbResults(data.results || []);
      setTmdbPage(data.page || 1);
      setTmdbTotalPages(data.total_pages || 1);
    } catch (err) {
      setMessage('TMDB search failed: ' + String(err.message || err));
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (!tmdbQuery) { setTmdbSuggestions([]); return; }
    const id = setTimeout(() => { fetchSuggestions(tmdbQuery); }, 250);
    return () => clearTimeout(id);
  }, [tmdbQuery]);

  async function fetchSuggestions(q) {
    try {
      const prefix = (q || '').toLowerCase();
      const maxPages = 5;
      const limit = 10;
      const matches = [];

      for (let page = 1; page <= maxPages && matches.length < limit; page++) {
        const data = await tmdbFetch('search', { q, page });
        if (!data || !Array.isArray(data.results)) break;
        const list = data.results || [];
        for (const m of list) {
          if (!m.title) continue;
          if (m.title.toLowerCase().startsWith(prefix)) {
            if (!matches.find(x => x.id === m.id)) matches.push(m);
            if (matches.length >= limit) break;
          }
        }
        if (page === maxPages && matches.length < limit) {
          for (const m of list) {
            if (!matches.find(x => x.id === m.id)) matches.push(m);
            if (matches.length >= limit) break;
          }
        }
      }

      setTmdbSuggestions(matches.slice(0, limit));
    } catch (err) {
      setTmdbSuggestions([]);
      setMessage('Autocomplete error: ' + String(err.message || err));
    }
  }

  async function tmdbFetch(mode, opts = {}) {
    const page = opts.page || 1;
    const q = opts.q || '';
    try {
      const path = mode === 'popular' ? `/api/tmdb/popular?page=${page}` : `/api/tmdb/search?q=${encodeURIComponent(q)}&page=${page}`;
      const res = await fetch(`${API}${path}`);
      if (res.ok) return res.json();
      const txt = await res.text();
      if (!FRONTEND_TMDB_KEY) {
        return { page: 1, total_pages: 1, results: [] };
      }
    } catch (err) {
    }

    if (FRONTEND_TMDB_KEY) {
      try {
        const base = 'https://api.themoviedb.org/3';
        const url = mode === 'popular'
          ? `${base}/movie/popular?api_key=${FRONTEND_TMDB_KEY}&language=en-US&page=${page}`
          : `${base}/search/movie?api_key=${FRONTEND_TMDB_KEY}&language=en-US&page=${page}&query=${encodeURIComponent(q)}`;
        const res2 = await fetch(url);
        if (!res2.ok) {
          const text = await res2.text();
          throw new Error(text || `HTTP ${res2.status}`);
        }
        return res2.json();
      } catch (err) {
        return { page: 1, total_pages: 1, results: [] };
      }
    }

    return { page: 1, total_pages: 1, results: [] };
  }

  async function addFromTmdb(m, save = true) {
    try {
      const idStr = String(m.id);
      if (deletedIds.has(idStr)) {
        if (save) {
          const res = await fetch(`${API}/api/films/${idStr}/restore`, { method: 'POST' });
          if (!res.ok) {
            const text = await res.text();
            throw new Error(text || 'Restore failed');
          }
          await fetchDeletedFilms();
          await fetchPopular(tmdbPage);
          setMessage('Restored'); setTimeout(()=>setMessage(''),1500);
        } else {
          setDeletedFilms(prev => prev.filter(x => String(x._id || x.id) !== idStr));
          setMessage('Restored locally'); setTimeout(()=>setMessage(''),1500);
        }
      } else {
        setMessage('Film is not marked deleted'); setTimeout(()=>setMessage(''),1500);
      }
      setTimeout(()=>setMessage(''),2000);
    } catch (err) {
      setMessage('Failed to add: ' + String(err.message || err));
    }
  }

  async function removeFilm(id) {
    if (!window.confirm('Delete this film?')) return;
    try {
      const res = await fetch(`${API}/api/films/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await fetchFilms();
      await fetchDeletedFilms();
      setTimeout(()=>setMessage(''),2000);
    } catch (err) {
      setMessage('Failed to delete');
    }
  }

  async function restoreFilm(id) {
    try {
      const res = await fetch(`${API}/api/films/${id}/restore`, { method: 'POST' });
      if (!res.ok) throw new Error('Restore failed');
      await fetchFilms();
      await fetchDeletedFilms();
      setTimeout(()=>setMessage(''),1500);
    } catch (err) {
      setMessage('Failed to restore');
    }
  }

  async function editFilmPrompt(f) {
    try {
      const newTitle = window.prompt('Title', f.title) || f.title;
      const newOverview = window.prompt('Overview', f.overview) || f.overview;
      const payload = Object.assign({}, f, { title: newTitle, overview: newOverview });
      const res = await fetch(`${API}/api/films/${f._id || f.id}`, { method: 'PUT', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Update failed');
      await fetchFilms();
      setMessage('Updated'); setTimeout(()=>setMessage(''),1500);
    } catch (err) {
      setMessage('Failed to update');
    }
  }

  const storedIds = new Set((films || []).map(f => String(f._id || f.id)));
  const deletedIds = new Set((deletedFilms || []).map(f => String(f._id || f.id)));

  async function deleteTmdbMovie(m) {
    try {
      const idStr = String(m.id);
      if (storedIds.has(idStr)) {
        const res = await fetch(`${API}/api/films/${idStr}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Delete failed');
      } else {
        const payload = { _id: String(m.id), id: m.id, title: m.title, overview: m.overview, poster_path: m.poster_path, release_date: m.release_date, vote_average: m.vote_average };
        const res = await fetch(`${API}/api/films/mark-deleted`, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error('Mark deleted failed');
      }
      await fetchDeletedFilms();
      setMessage('Deleted');
      setTimeout(()=>setMessage(''),1200);
    } catch (err) {
      setMessage('Failed to delete'); setTimeout(()=>setMessage(''),2000);
    }
  }

  const displayedTmdb = (tmdbResults || []).filter(m => {
    if (!tmdbQuery) return true;
    const t = (m.title || '').toLowerCase();
    return t.indexOf((tmdbQuery || '').toLowerCase()) !== -1;
  });

  return (
    <div>
      <AdminHeader title="Admin — Films" />
      <div style={{ padding: 20 }}>
        <h2>Admin — Films</h2>
        <div style={{ marginBottom: 12, color: '#333' }}></div>
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => { window.location.href = '/admin/users'; }} style={{ marginRight: 8 }}>Accéder aux utilisateurs</button>
        </div>

        <div style={{ marginBottom: 10, color: 'green' }}>{message}</div>

        <div style={{ marginBottom: 16, padding: 8, border: '1px solid #ddd' }}>
            <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ marginRight: 8 }}>Catalog:</label>
            <input id="tmdb-search-input" placeholder="Search a movie" value={tmdbQuery} onChange={e=>setTmdbQuery(e.target.value)} onKeyDown={e=>{ if (e.key === 'Enter') e.preventDefault(); }} style={{ width: 360, marginLeft: 8 }} />
            <div style={{ marginLeft: 'auto' }}>
              <span style={{ color: 'green' }}>{message}</span>
            </div>
          </div>

          {tmdbSuggestions.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {tmdbSuggestions.map(s => (
                <div key={s.id} style={{ width: 160, display: 'flex', gap: 8, alignItems: 'center', border: '1px solid #eee', padding: 6, background: '#fff' }}>
                  {s.poster_path ? <img src={`https://image.tmdb.org/t/p/w92${s.poster_path}`} alt={s.title} style={{ width: 56, height: 84, objectFit: 'cover' }} /> : <div style={{ width:56, height:84, background:'#ccc' }} />}
                  <div style={{ fontSize: 13 }}>{s.title}</div>
                </div>
              ))}
            </div>
          )}

          <div>
            {loading ? <div>Loading...</div> : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {displayedTmdb.map(m => {
                  const idStr = String(m.id);
                  const isDeleted = deletedIds.has(idStr);
                  return (
                    <div key={m.id} style={{ width: 160, border: '1px solid #eee', padding: 8, background: '#fff' }}>
                      <div style={{ height: 224, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {m.poster_path ? (
                          <img src={`https://image.tmdb.org/t/p/w185${m.poster_path}`} alt={m.title} style={{ width: '100%', height: 220, objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: 220, background: '#ccc' }} />
                        )}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>{m.title}</div>
                      <div style={{ fontSize: 12, color: '#666' }}>{m.release_date} — {m.vote_average}</div>
                      <div style={{ marginTop: 8 }}>
                        {isDeleted ? (
                          <button disabled style={{ color: '#777', opacity: 0.7 }}>Deleted</button>
                        ) : (
                          <button onClick={() => deleteTmdbMovie(m)}>Delete</button>
                        )}
                        {isDeleted && (
                          <button onClick={() => addFromTmdb(m, true)} style={{ marginLeft: 8 }}>Add back</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ marginTop: 10 }}>
            <button onClick={() => {
              const newPage = Math.max(1, tmdbPage - 1);
              setTmdbPage(newPage);
              if (tmdbMode === 'popular') fetchPopular(newPage); else searchTmdb(tmdbQuery, newPage);
            }} disabled={tmdbPage <= 1}>Prev</button>
            <span style={{ margin: '0 8px' }}>Page {tmdbPage} / {tmdbTotalPages}</span>
            <button onClick={() => {
              const newPage = Math.min(tmdbTotalPages || tmdbPage + 1, tmdbPage + 1);
              setTmdbPage(newPage);
              if (tmdbMode === 'popular') fetchPopular(newPage); else searchTmdb(tmdbQuery, newPage);
            }} disabled={tmdbPage >= tmdbTotalPages}>Next</button>
          </div>
        </div>

        {}
          <div style={{ marginTop: 20 }}>
            <h3>Deleted films</h3>
            {(!deletedFilms || deletedFilms.length === 0) ? (
              <div>No deleted films.</div>
            ) : (
              <table border="1" cellPadding="6">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Release</th>
                    <th>Rating</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deletedFilms.map(f => (
                    <tr key={f._id || f.id}>
                      <td>{f.title}</td>
                      <td>{f.release_date}</td>
                      <td>{f.vote_average}</td>
                      <td>
                        <button onClick={() => restoreFilm(f._id || f.id)}>Add back</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

      </div>
    </div>
  );
}

