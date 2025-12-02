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
  const [userReviews, setUserReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(false);

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
          
          // Charger les reviews de l'utilisateur
          loadUserReviews(resp.data.user.id);
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

  const loadUserReviews = async (userId) => {
    setLoadingReviews(true);
    try {
      const resp = await axios.get('http://localhost:3003/reviews', { 
        withCredentials: true,
        timeout: 8000 
      });
      
      if (resp && resp.data) {
        // Filtrer les reviews de l'utilisateur connecté
        const filteredReviews = resp.data.filter(review => review.user_id === userId);
        setUserReviews(filteredReviews);
      }
    } catch (err) {
      console.error('Error loading user reviews:', err);
    } finally {
      setLoadingReviews(false);
    }
  };

  const handleDeleteReview = async (reviewId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cet avis ?')) return;

    try {
      const headers = {};
      const csrf = getCsrfToken(); 
      if (csrf) headers['x-csrf-token'] = csrf;

      await axios.delete(`http://localhost:3003/reviews/${reviewId}`, {
        withCredentials: true,
        headers,
        timeout: 8000
      });

      // Retirer la review de la liste
      setUserReviews(prev => prev.filter(r => r.id !== reviewId));
      setMessage('Avis supprimé avec succès');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Error deleting review:', err);
      setError('Erreur lors de la suppression de l\'avis');
      setTimeout(() => setError(''), 3000);
    }
  };

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
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 20 }}>
      <h2>Mon Profil</h2>
      {message && <div style={{ background: '#e8f5e9', padding: 10, borderRadius: 6, color: '#2e7d32', marginBottom: 16 }}>{message}</div>}
      {error && <div style={{ background: '#ffebee', padding: 10, borderRadius: 6, color: '#c62828', marginBottom: 16 }}>{error}</div>}

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

      {/* Section des reviews de l'utilisateur */}
      <div style={{ marginTop: 40, borderTop: '2px solid #e0e0e0', paddingTop: 24 }}>
        <h3>Mes Avis ({userReviews.length})</h3>
        
        {loadingReviews ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#666' }}>Chargement des avis...</div>
        ) : userReviews.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#666', background: '#f5f5f5', borderRadius: 6 }}>
            Vous n'avez pas encore publié d'avis.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
            {userReviews.map((review) => (
              <div 
                key={review.id} 
                style={{ 
                  border: '1px solid #e0e0e0', 
                  borderRadius: 8, 
                  padding: 16,
                  background: '#fafafa'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <strong style={{ fontSize: '1.1em' }}>Film ID: {review.movie_id}</strong>
                    <div style={{ 
                      display: 'inline-block',
                      marginLeft: 12,
                      background: '#ffeb3b', 
                      padding: '4px 10px', 
                      borderRadius: 4,
                      fontWeight: 'bold'
                    }}>
                      ⭐ {review.rating}/5
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteReview(review.id)}
                    style={{
                      background: '#d32f2f',
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: '0.9em'
                    }}
                  >
                    🗑️ Supprimer
                  </button>
                  <button
                    onClick={navigate.bind(null, `/movie/${review.movie_id}`)}
                    style={{
                      background: '#812fd3ff',
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: '0.9em'
                    }}
                  >
                    Voir le detail fu film
                  </button>

                </div>
                
                <p style={{ 
                  margin: '12px 0', 
                  lineHeight: 1.6,
                  color: '#333'
                }}>
                  {review.comment}
                </p>
                
                <div style={{ 
                  fontSize: '0.85em', 
                  color: '#999',
                  marginTop: 8
                }}>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}