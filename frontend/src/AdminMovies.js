import React, { useEffect, useState } from 'react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:4000';

export default function AdminMovies() {
  const [films, setFilms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ title: '', overview: '', poster_path: '', release_date: '', vote_average: '' });
  const [editingId, setEditingId] = useState(null);

  useEffect(() => { fetchFilms(); }, []);

  async function fetchFilms() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/films`);
      const data = await res.json();
      setFilms(data || []);
    } catch (err) {
      setMessage('Failed to load films');
    } finally { setLoading(false); }
  }

  function editFilm(f) {
    setEditingId(f._id || f.id);
    setForm({ title: f.title || '', overview: f.overview || '', poster_path: f.poster_path || '', release_date: f.release_date || '', vote_average: f.vote_average || '' });
  }

  function resetForm() { setEditingId(null); setForm({ title: '', overview: '', poster_path: '', release_date: '', vote_average: '' }); }

  async function submit(e) {
    e.preventDefault();
    try {
      const payload = { ...form };
      let res;
      if (editingId) {
        res = await fetch(`${API}/api/films/${editingId}`, { method: 'PUT', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      } else {
        res = await fetch(`${API}/api/films`, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      }
      if (!res.ok) throw new Error('Request failed');
      await fetchFilms();
      resetForm();
      setMessage('Saved');
      setTimeout(()=>setMessage(''),2000);
    } catch (err) {
      setMessage('Failed to save');
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

  // No manual sync in UI — backend ensures 200 films on startup.

  return (
    <div style={{ padding: 20 }}>
      <h2>Admin — Films</h2>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontStyle: 'italic' }}>The table is pre-filled with 200 films on server startup (TMDB if the server has a key, otherwise generated samples).</div>
      </div>
      <div style={{ marginBottom: 10, color: 'green' }}>{message}</div>

      <form onSubmit={submit} style={{ marginBottom: 20 }}>
        <input placeholder="Title" value={form.title} onChange={e=>setForm({...form, title: e.target.value})} required style={{ width: 300 }} />
        <input placeholder="Release date" value={form.release_date} onChange={e=>setForm({...form, release_date: e.target.value})} style={{ marginLeft:8 }} />
        <input placeholder="Rating" value={form.vote_average} onChange={e=>setForm({...form, vote_average: e.target.value})} style={{ marginLeft:8, width:80 }} />
        <div style={{ marginTop:8 }}>
          <input placeholder="Poster path" value={form.poster_path} onChange={e=>setForm({...form, poster_path: e.target.value})} style={{ width: 400 }} />
        </div>
        <div style={{ marginTop:8 }}>
          <textarea placeholder="Overview" value={form.overview} onChange={e=>setForm({...form, overview: e.target.value})} rows={3} cols={80} />
        </div>
        <div style={{ marginTop:8 }}>
          <button type="submit">{editingId ? 'Update' : 'Add'}</button>
          <button type="button" onClick={resetForm} style={{ marginLeft:8 }}>Clear</button>
        </div>
      </form>

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
                  <button onClick={()=>editFilm(f)}>Edit</button>
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
