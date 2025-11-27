import React, { useEffect, useState } from 'react';

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
  const [saveAddedToServer, setSaveAddedToServer] = useState(true);
  const [backendHasKey, setBackendHasKey] = useState(null); 

  useEffect(() => { fetchFilms(); }, []);

  useEffect(() => { if (tmdbMode === 'popular') fetchPopular(tmdbPage); }, [tmdbMode, tmdbPage]);

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
        if (!data.tmdb_key_present) {
          if (!FRONTEND_TMDB_KEY) {
            setMessage('Warning: No TMDB key on backend');
          }
        } else {
          setMessage('');
        }
      } catch (err) {
        if (cancelled) return;
        setBackendHasKey(false);
        if (!FRONTEND_TMDB_KEY) {
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

    if (backendHasKey === true) {
      const path = mode === 'popular' ? `/api/tmdb/popular?page=${page}` : `/api/tmdb/search?q=${encodeURIComponent(q)}&page=${page}`;
      const res = await fetch(`${API}${path}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      return res.json();
    }

    if (FRONTEND_TMDB_KEY) {
      const base = 'https://api.themoviedb.org/3';
      const url = mode === 'popular'
        ? `${base}/movie/popular?api_key=${FRONTEND_TMDB_KEY}&language=en-US&page=${page}`
        : `${base}/search/movie?api_key=${FRONTEND_TMDB_KEY}&language=en-US&page=${page}&query=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      return res.json();
    }

    throw new Error('No TMDB API key available');
  }

  async function addFromTmdb(m, save = true) {
    try {
      const exists = films.find(f => String(f.id) === String(m.id) || String(f._id) === String(m.id));
      if (exists) { setMessage('Already added'); setTimeout(()=>setMessage(''),1500); return; }
      const payload = { _id: String(m.id), id: m.id, title: m.title, overview: m.overview, poster_path: m.poster_path, release_date: m.release_date, vote_average: m.vote_average };
      if (save) {
        const res = await fetch(`${API}/api/films`, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || 'Add failed');
        }
        const added = await res.json();
        await fetchFilms();
        setMessage('Added to server');
        setTmdbResults(prev => prev.filter(x => String(x.id) !== String(m.id)));
        setTmdbSuggestions(prev => prev.filter(x => String(x.id) !== String(m.id)));
      } else {
        setFilms(prev => [payload, ...prev]);
        setTmdbResults(prev => prev.filter(x => String(x.id) !== String(m.id)));
        setTmdbSuggestions(prev => prev.filter(x => String(x.id) !== String(m.id)));
        setMessage('Added locally (not saved)');
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
      setMessage('Deleted');
      setTimeout(()=>setMessage(''),2000);
    } catch (err) {
      setMessage('Failed to delete');
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

  return (
    <div style={{ padding: 20 }}>
      <h2>Admin — Films</h2>
      
      <div style={{ marginBottom: 10, color: 'green' }}>{message}</div>

      <div style={{ marginBottom: 16, padding: 8, border: '1px solid #ddd' }}>
        <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ marginRight: 8 }}>Catalog:</label>
          <button onClick={() => { setTmdbMode('popular'); setTmdbPage(1); fetchPopular(1); }}>Popular</button>
          <button onClick={() => { setTmdbMode('search'); setTmdbResults([]); setTmdbPage(1); }}>Search</button>
          <div style={{ marginLeft: 'auto' }}>
            <span style={{ color: 'green' }}>{message}</span>
          </div>
        </div>

        {tmdbMode === 'search' && (
          <div style={{ marginBottom: 8 }}>
            <input placeholder="Search TMDB" value={tmdbQuery} onChange={e=>setTmdbQuery(e.target.value)} style={{ width: 360 }} />
            <button onClick={()=>searchTmdb(tmdbQuery, 1)} style={{ marginLeft: 8 }}>Search</button>
            <label style={{ marginLeft: 12, fontSize: 13 }}>
              <input type="checkbox" checked={saveAddedToServer} onChange={e=>setSaveAddedToServer(e.target.checked)} style={{ marginRight: 6 }} />
              Save added to server
            </label>

            {}
                {tmdbSuggestions.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {tmdbSuggestions.map(s => (
                  <div key={s.id} onClick={() => { addFromTmdb(s, saveAddedToServer); setTmdbQuery(''); setTmdbSuggestions([]); }} style={{ cursor: 'pointer', width: 160, display: 'flex', gap: 8, alignItems: 'center', border: '1px solid #eee', padding: 6, background: '#fff' }}>
                    {s.poster_path ? <img src={`https://image.tmdb.org/t/p/w92${s.poster_path}`} alt={s.title} style={{ width: 56, height: 84, objectFit: 'cover' }} /> : <div style={{ width:56, height:84, background:'#ccc' }} />}
                    <div style={{ fontSize: 13 }}>{s.title}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {loading ? <div>Loading...</div> : tmdbResults.map(m => (
              <div key={m.id} style={{ width: 140, textAlign: 'center', border: '1px solid #eee', padding: 6 }}>
                {m.poster_path ? <img src={`https://image.tmdb.org/t/p/w200${m.poster_path}`} alt={m.title} style={{ width: '100%' }} /> : <div style={{ width:'100%', height:210, background:'#ccc' }} />}
                <div style={{ fontSize: 12, marginTop: 6 }}>{m.title}</div>
                    <button onClick={()=>addFromTmdb(m, saveAddedToServer)} style={{ marginTop:6 }}>Add</button>
              </div>
            ))}
          </div>
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

      {loading ? <div>Loading...</div> : (
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
            {films.map(f => (
              <tr key={f._id || f.id}>
                <td>{f.title}</td>
                <td>{f.release_date}</td>
                <td>{f.vote_average}</td>
                <td>
                  <button onClick={()=>editFilmPrompt(f)}>Edit</button>
                  <button onClick={()=>removeFilm(f._id || f.id)} style={{ marginLeft:8 }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}