import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminHeader from './AdminHeader';
import { getCsrfToken } from './utils/csrf';

const API = process.env.REACT_APP_API_URL || 'http://localhost:4000';

export default function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ nom:'', prenom:'', email:'', password:'', role:'user' });

  useEffect(() => { 
    (async function check() {
      try {
        const me = await fetch(`${API}/api/auth/me`, { credentials: 'include' });
        if (!me.ok) return navigate('/login');
        const data = await me.json();
        if (!data.user || data.user.role !== 'admin') return navigate('/login');
      } catch (e) {
        return navigate('/login');
      }
      fetchUsers();
    })();
  }, [navigate]);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/users`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setUsers(data || []);
    } catch (err) {
      setMessage('Failed to load users');
    } finally { setLoading(false); }
  }

  async function createUser(e) {
    e && e.preventDefault();
    try {
      const payload = { ...form };
      const headers = { 'Content-Type':'application/json' };
      const csrf = getCsrfToken(); if (csrf) headers['x-csrf-token'] = csrf;
      const res = await fetch(`${API}/api/users`, { method: 'POST', credentials: 'include', headers, body: JSON.stringify(payload) });
      if (!res.ok) {
        const text = await res.text(); throw new Error(text || 'Create failed');
      }
      setForm({ nom:'', prenom:'', email:'', password:'', role:'user' });
      setMessage('Created');
      await fetchUsers();
      setTimeout(()=>setMessage(''),1500);
    } catch (err) {
      setMessage('Create failed: ' + String(err.message || err));
    }
  }

  async function deleteUser(id) {
    if (!window.confirm('Delete user?')) return;
    try {
      const headers = {};
      const csrf = getCsrfToken(); if (csrf) headers['x-csrf-token'] = csrf;
      const res = await fetch(`${API}/api/users/${id}`, { method: 'DELETE', credentials: 'include', headers });
      if (!res.ok) throw new Error('Delete failed');
      setMessage('Deleted');
      await fetchUsers();
      setTimeout(()=>setMessage(''),1500);
    } catch (err) {
      setMessage('Delete failed');
    }
  }

  async function editUserPrompt(u) {
    try {
      const nom = window.prompt('Nom', u.nom) || u.nom;
      const prenom = window.prompt('Prenom', u.prenom) || u.prenom;
      const email = window.prompt('Email', u.email) || u.email;
      const role = window.prompt('Role (user/admin)', u.role) || u.role;
      const password = window.prompt('New password (leave empty to keep)') || '';
      const payload = { nom, prenom, email, role };
      if (password) payload.password = password;
      const headers = { 'Content-Type':'application/json' };
      const csrf = getCsrfToken(); if (csrf) headers['x-csrf-token'] = csrf;
      const res = await fetch(`${API}/api/users/${u.id}`, { method: 'PUT', credentials: 'include', headers, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Update failed');
      setMessage('Updated');
      await fetchUsers();
      setTimeout(()=>setMessage(''),1500);
    } catch (err) {
      setMessage('Update failed');
    }
  }

  async function createAdmin(e) {
    e && e.preventDefault();
    try {
      const payload = { ...form, role: 'admin' };
      const headers = { 'Content-Type':'application/json' };
      const csrf = getCsrfToken(); if (csrf) headers['x-csrf-token'] = csrf;
      const res = await fetch(`${API}/api/users`, { method: 'POST', credentials: 'include', headers, body: JSON.stringify(payload) });
      if (!res.ok) {
        const text = await res.text(); throw new Error(text || 'Create failed');
      }
      setForm({ nom:'', prenom:'', email:'', password:'', role:'user' });
      setMessage('Admin créé');
      await fetchUsers();
      setTimeout(()=>setMessage(''),1500);
    } catch (err) {
      setMessage('Create failed: ' + String(err.message || err));
    }
  }

  return (
    <div>
      <AdminHeader title="Admin — Utilisateurs" />
      <div style={{ padding: 20 }}>
        <h2>Admin — Users</h2>
        <div style={{ marginBottom: 10, color: 'green' }}>{message}</div>

      <form onSubmit={createUser} style={{ marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input placeholder="Nom" value={form.nom} onChange={e=>setForm({...form, nom:e.target.value})} />
        <input placeholder="Prenom" value={form.prenom} onChange={e=>setForm({...form, prenom:e.target.value})} />
        <input placeholder="Email" value={form.email} onChange={e=>setForm({...form, email:e.target.value})} />
        <input placeholder="Password" type="password" value={form.password} onChange={e=>setForm({...form, password:e.target.value})} />
        <select value={form.role} onChange={e=>setForm({...form, role:e.target.value})}>
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
        <div>
          <button type="submit">Create</button>
        </div>
        <div>
          <button type="button" onClick={createAdmin} style={{ background: '#b33', color: '#fff' }}>Create Admin</button>
        </div>
      </form>
      <div style={{ marginBottom: 12 }}>
        <button onClick={() => { window.location.href = '/admin'; }}>Retour films</button>
      </div>

      {loading ? <div>Loading...</div> : (
        <table border="1" cellPadding="6">
          <thead>
            <tr>
              <th>Id</th>
              <th>Nom</th>
              <th>Prenom</th>
              <th>Email</th>
              <th>Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>{u.nom}</td>
                <td>{u.prenom}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>
                  <button onClick={()=>editUserPrompt(u)}>Edit</button>
                  <button onClick={()=>deleteUser(u.id)} style={{ marginLeft:8 }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      </div>
    </div>
  );
}
