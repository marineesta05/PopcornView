import { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { getCsrfToken } from '../utils/csrf';

const PASSWORD_RULES = {
  minLen: 12,
};

function meetsPasswordPolicy(pw) {
  if (!pw || pw.length < PASSWORD_RULES.minLen) return false;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[@$!%*?&^#()\[\]{}<>~`_+=|:;.,\/\\-]/];
  const matched = classes.reduce((c, rx) => c + (rx.test(pw) ? 1 : 0), 0);
  return matched >= 3;
}

export default function Profile() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);

  const [form, setForm] = useState({ nom: '', prenom: '', email: '', password: '', confirmPassword: '' });

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const resp = await axios.get('http://localhost:4000/api/auth/me', { withCredentials: true, timeout: 8000 });
        if (!mounted) return;
        if (resp && resp.data && resp.data.user) {
          setUser(resp.data.user);
          setForm({ nom: resp.data.user.nom || '', prenom: resp.data.user.prenom || '', email: resp.data.user.email || '', password: '', confirmPassword: '' });
        } else {
          navigate('/login', { replace: true });
        }
      } catch (e) {
        console.error('Failed to load current user', e && e.response?.data ? e.response.data : e);
        navigate('/login', { replace: true });
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setError('');
    setMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!user) return setError('Utilisateur non chargé');

    if (!form.nom.trim() || !form.prenom.trim() || !form.email.trim()) {
      return setError('Nom, prénom et email sont requis');
    }

    if (form.password || form.confirmPassword) {
      if (form.password !== form.confirmPassword) return setError('Les mots de passe ne correspondent pas');
      if (!meetsPasswordPolicy(form.password)) return setError(`Mot de passe invalide — min ${PASSWORD_RULES.minLen} caractères et 3 types`) ;
    }

    try {
      setLoading(true);
      const headers = { 'Content-Type': 'application/json' };
      const csrf = getCsrfToken(); if (csrf) headers['x-csrf-token'] = csrf;

      const payload = { nom: form.nom.trim(), prenom: form.prenom.trim(), email: form.email.trim() };
      if (form.password) payload.password = form.password;

      const resp = await axios.put(`http://localhost:4000/api/users/${user.id}`, payload, { withCredentials: true, headers, timeout: 10000 });
      if (resp && resp.data) {
        setMessage('Profil mis à jour avec succès');
        setUser(resp.data);
        setForm(prev => ({ ...prev, password: '', confirmPassword: '' }));
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (err) {
      console.error('Error updating profile', err && err.response?.data ? err.response.data : err);
      setError(err.response?.data?.error || err.response?.data?.message || 'Erreur lors de la mise à jour');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', marginTop: 40 }}>Chargement...</div>;

  return (
    <div style={{ maxWidth: 700, margin: '40px auto', padding: 20 }}>
      <h2>Mon Profil</h2>
      {message && <div style={{ background: '#e8f5e9', padding: 10, borderRadius: 6, color: '#2e7d32' }}>{message}</div>}
      {error && <div style={{ background: '#ffebee', padding: 10, borderRadius: 6, color: '#c62828' }}>{error}</div>}

      <form onSubmit={handleSubmit} style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontWeight: 'bold' }}>Nom</label>
          <input name="nom" value={form.nom} onChange={handleChange} maxLength={50} style={{ width: '100%', padding: 8 }} required />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 'bold' }}>Prénom</label>
          <input name="prenom" value={form.prenom} onChange={handleChange} maxLength={50} style={{ width: '100%', padding: 8 }} required />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 'bold' }}>Email</label>
          <input name="email" value={form.email} onChange={handleChange} type="email" maxLength={100} style={{ width: '100%', padding: 8 }} required />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 'bold' }}>Nouveau mot de passe (laisser vide pour conserver l'actuel)</label>
          <input name="password" value={form.password} onChange={handleChange} type="password" style={{ width: '100%', padding: 8 }} />
          <small style={{ color: '#666' }}>Min. {PASSWORD_RULES.minLen} caractères et inclure au moins 3 types : majuscule, minuscule, chiffre, caractère spécial</small>
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 'bold' }}>Confirmer nouveau mot de passe</label>
          <input name="confirmPassword" value={form.confirmPassword} onChange={handleChange} type="password" style={{ width: '100%', padding: 8 }} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="submit" disabled={loading} style={{ background: '#131a20', color: '#fff', padding: '10px 14px', border: 'none', borderRadius: 6, cursor: 'pointer' }}>{loading ? 'Enregistrement...' : 'Enregistrer'}</button>
          <button type="button" onClick={() => navigate('/home')} style={{ background: '#6c757d', color: '#fff', padding: '10px 14px', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Retour</button>
        </div>
      </form>
    </div>
  );
}
