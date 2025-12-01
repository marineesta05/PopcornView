import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import axios from "axios";
import { jwtDecode } from "jwt-decode";

const FILMS_API = 'http://localhost:4000/api';

const Home = () => {
    const navigate = useNavigate();
    const [movies, setMovies] = useState([]);
    const [users, setUsers] = useState([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [token, setToken] = useState(localStorage.getItem("token"));
    
    const [showTmdbPanel, setShowTmdbPanel] = useState(false);
    const [showUsersPanel, setShowUsersPanel] = useState(false);
    const [tmdbMode, setTmdbMode] = useState('search');
    const [tmdbQuery, setTmdbQuery] = useState('');
    const [tmdbResults, setTmdbResults] = useState([]);
    const [tmdbPage, setTmdbPage] = useState(1);
    const [tmdbTotalPages, setTmdbTotalPages] = useState(1);
    const [tmdbLoading, setTmdbLoading] = useState(false);
    const [apiConnectionError, setApiConnectionError] = useState(false);
    const [catalogPages, setCatalogPages] = useState(1);
    const [loadingMore, setLoadingMore] = useState(false);
    const [showDeletedPanel, setShowDeletedPanel] = useState(false);
    const [deletedFilms, setDeletedFilms] = useState([]);
    const [deletedLoading, setDeletedLoading] = useState(false);
    const [showCommentsPanel, setShowCommentsPanel] = useState(false);
    const [comments, setComments] = useState([]);
    const [commentsLoading, setCommentsLoading] = useState(false);
    const [userQuery, setUserQuery] = useState('');
    const [userResults, setUserResults] = useState([]);
    const [userLoading, setUserLoading] = useState(false);
    const [userPage, setUserPage] = useState(1);
    const [userTotalPages, setUserTotalPages] = useState(1);
    
    const [userForm, setUserForm] = useState({
        nom: '',
        prenom: '',
        email: '',
        password: '',
        role: 'user'
    });
    
    useEffect(() => {
        const checkAuth = () => {
            const currentToken = localStorage.getItem("token");
            
            if (!currentToken) {
                console.log("❌ Aucun token trouvé, redirection vers login");
                navigate('/login', { replace: true });
                return;
            }

            try {
                const decoded = jwtDecode(currentToken);
                const currentTime = Date.now() / 1000;
                
                if (decoded.exp && decoded.exp < currentTime) {
                    console.log("❌ Token expiré");
                    localStorage.removeItem("token");
                    navigate('/login', { replace: true });
                    return;
                }
                
                console.log("✅ Token valide, rôle:", decoded.role);
                setIsAdmin(decoded.role === 'admin');
                setToken(currentToken);
                setLoading(false);
            } catch (error) {
                console.error("❌ Token invalide:", error.message);
                localStorage.removeItem("token");
                navigate('/login', { replace: true });
            }
        };

        checkAuth();
    }, [navigate]);
    
    useEffect(() => {
        if (!loading && token) {
                console.log("🔄 Chargement des films...");
                fetchMovies(catalogPages);
                if (isAdmin) {
                    fetchUsers();
                }
            }
    }, [loading, token, isAdmin, catalogPages]);

    const fetchDeletedFilms = async () => {
        if (!token) return;
        setDeletedLoading(true);
        try {
            const resp = await axios.get(`${FILMS_API}/films/deleted`, {
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 10000
            });
            setDeletedFilms(resp.data || []);
        } catch (err) {
            console.error('Erreur fetchDeletedFilms', err);
            setMessage('Erreur lors du chargement des films supprimés');
            setTimeout(() => setMessage(''), 3000);
        } finally {
            setDeletedLoading(false);
        }
    };

    const restoreDeleted = async (movieId) => {
        if (!token) return;
        if (!window.confirm('Restaurer ce film ?')) return;
        try {
            await axios.post(`${FILMS_API}/films/${movieId}/restore`, {}, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setMessage('✅ Film restauré');
            fetchMovies();
            fetchDeletedFilms();
            setTimeout(() => setMessage(''), 2000);
        } catch (err) {
            console.error('Erreur restoreDeleted', err);
            setMessage('❌ Impossible de restaurer');
            setTimeout(() => setMessage(''), 3000);
        }
    };

    const fetchComments = async () => {
        if (!token) return;
        setCommentsLoading(true);
        try {
            const res = await axios.get('http://localhost:3003/reviews', {
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 10000
            });
            const rows = res.data || [];

            const enriched = await Promise.all(rows.map(async r => {
                const movieId = r.movie_id;
                let title = '';
                try {
                    const mres = await axios.get(`${FILMS_API}/movies/${movieId}`, {
                        headers: { 'Authorization': `Bearer ${token}` },
                        timeout: 8000
                    });
                    title = mres.data && (mres.data.title || mres.data.name) ? (mres.data.title || mres.data.name) : '';
                } catch (e) {
                }
                return {
                    id: r.id,
                    movie_id: r.movie_id,
                    title,
                    user_email: r.email || r.user_email || r.user || '',
                    rating: r.rating || r.note || r.score || null,
                    comment: r.comment || r.commentaire || ''
                };
            }));

            setComments(enriched);
        } catch (err) {
            console.error('Error fetching comments', err);
            setMessage('Erreur lors du chargement des commentaires');
            setTimeout(() => setMessage(''), 3000);
        } finally {
            setCommentsLoading(false);
        }
    };

    const deleteComment = async (id) => {
        if (!token) return;
        if (!window.confirm('Supprimer ce commentaire définitivement ?')) return;
        try {
            await axios.delete(`http://localhost:3003/reviews/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 10000
            });
            setMessage('✅ Commentaire supprimé');
            fetchComments();
            setTimeout(() => setMessage(''), 2000);
        } catch (err) {
            console.error('Error deleting comment', err);
            setMessage('❌ Impossible de supprimer le commentaire');
            setTimeout(() => setMessage(''), 3000);
        }
    };

    const checkApiConnection = async () => {
        try {
            await axios.get(`${FILMS_API}/health`, { timeout: 5000 });
            setApiConnectionError(false);
            return true;
        } catch (error) {
            console.error("API non accessible:", error.message);
            setApiConnectionError(true);
            setMessage(`⚠️ API Films non accessible (${FILMS_API}). Vérifiez que le serveur est démarré.`);
            return false;
        }
    };

    const searchForUser = async (q, page = 1) => {
        if (!q) {
            setUserResults([]);
            return;
        }
        setUserLoading(true);
        try {
            const response = await axios.get(`${FILMS_API}/tmdb/search?q=${encodeURIComponent(q)}&page=${page}`, {
                timeout: 10000,
                headers: { 'Authorization': `Bearer ${token}` }
            });
            let results = response.data.results || [];
            try {
                const delResp = await axios.get(`${FILMS_API}/films/deleted`, {
                    timeout: 8000,
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const deleted = delResp.data || [];
                const deletedIds = new Set((deleted || []).map(d => String(d._id || d.id)));
                results = (results || []).filter(r => !deletedIds.has(String(r.id)));
            } catch (e) {
                console.warn('Could not fetch deleted films to filter user results', e && e.message ? e.message : e);
            }
            setUserResults(results);
            setUserPage(response.data.page || 1);
            setUserTotalPages(response.data.total_pages || 1);
        } catch (err) {
            console.error('Error searchForUser', err);
            setMessage('Erreur lors de la recherche de films');
            setTimeout(() => setMessage(''), 3000);
        } finally {
            setUserLoading(false);
        }
    };

    useEffect(() => {
        const q = (userQuery || '').trim();
        if (!q) {
            setUserResults([]);
            setUserPage(1);
            setUserTotalPages(1);
            return;
        }
        const id = setTimeout(() => searchForUser(q, 1), 300);
        return () => clearTimeout(id);
    }, [userQuery]);

    const fetchMovies = async (pages = catalogPages, append = false) => {
        if (!token) {
            console.log("❌ Aucun token disponible pour fetchMovies");
            return;
        }

        if (append) setLoadingMore(true);
        try {
            console.log("🔄 Fetch catalog avec token:", token);
            const response = await axios.get(`${FILMS_API}/catalog?pages=${pages}`, {
                timeout: 10000,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const results = response.data && response.data.results ? response.data.results : [];
            const prepared = (results || []).map(f => Object.assign({}, f, { added: true }));
            const visible = prepared.filter(f => !f.deleted);
            console.log("✅ Catalog récupéré:", results.length, "films (", visible.length, "visible)");
            if (append) {
                setMovies(prev => {
                    const merged = [...(prev || []), ...(visible || [])];
                    const dedup = Array.from(new Map(merged.map(m => [m.id || m._id, m])).values());
                    return dedup;
                });
            } else {
                setMovies(visible || []);
            }
            setApiConnectionError(false);
        } catch (error) {
            if (append) setLoadingMore(false);
            console.error("❌ Erreur fetchMovies (catalog):", error);
            try {
                const resp2 = await axios.get(`${FILMS_API}/films`, {
                    timeout: 10000,
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                setMovies(resp2.data || []);
                setApiConnectionError(false);
                return;
            } catch (err2) {
                console.error('Fallback fetch stored films failed', err2);
            }

            console.error("Détails:", error.response?.data);
            if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
                setMessage(`❌ Impossible de se connecter à l'API Films (${FILMS_API}). Vérifiez que le serveur backend est démarré.`);
                setApiConnectionError(true);
            } else if (error.response?.status === 401) {
                setMessage('Token invalide ou expiré. Veuillez vous reconnecter.');
                setTimeout(() => {
                    localStorage.removeItem("token");
                    navigate('/login', { replace: true });
                }, 3000);
            } else if (error.response?.status === 403) {
                setMessage('Accès non autorisé');
            } else {
                setMessage('Erreur lors du chargement des films: ' + (error.response?.data?.error || error.message));
            }
            setTimeout(() => setMessage(''), 5000);
        } finally {
            if (append) setLoadingMore(false);
        }
    };

    const fetchUsers = async () => {
        if (!isAdmin) return;
        
        try {
            const response = await axios.get(`${FILMS_API}/users`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            setUsers(response.data || []);
        } catch (error) {
            console.error("Erreur lors du chargement des utilisateurs:", error);
            setMessage('Erreur lors du chargement des utilisateurs');
            setTimeout(() => setMessage(''), 3000);
        }
    };

    const createUser = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${FILMS_API}/users`, userForm, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            setUserForm({ nom: '', prenom: '', email: '', password: '', role: 'user' });
            setMessage('✅ Utilisateur créé avec succès');
            fetchUsers();
            setTimeout(() => setMessage(''), 2000);
        } catch (error) {
            console.error("Erreur création utilisateur:", error);
            setMessage('❌ Erreur lors de la création: ' + (error.response?.data?.error || error.message));
            setTimeout(() => setMessage(''), 3000);
        }
    };

    const createAdmin = async (e) => {
        e.preventDefault();
        try {
            const adminData = { ...userForm, role: 'admin' };
            await axios.post(`${FILMS_API}/users`, adminData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            setUserForm({ nom: '', prenom: '', email: '', password: '', role: 'user' });
            setMessage('✅ Administrateur créé avec succès');
            fetchUsers();
            setTimeout(() => setMessage(''), 2000);
        } catch (error) {
            console.error("Erreur création admin:", error);
            setMessage('❌ Erreur lors de la création: ' + (error.response?.data?.error || error.message));
            setTimeout(() => setMessage(''), 3000);
        }
    };

    const editUser = async (user) => {
        const nom = window.prompt('Nom', user.nom) || user.nom;
        const prenom = window.prompt('Prénom', user.prenom) || user.prenom;
        const email = window.prompt('Email', user.email) || user.email;
        const role = window.prompt('Rôle (user/admin)', user.role) || user.role;
        const password = window.prompt('Nouveau mot de passe (laisser vide pour garder actuel)') || '';

        try {
            const payload = { nom, prenom, email, role };
            if (password) payload.password = password;

            await axios.put(`${FILMS_API}/users/${user.id}`, payload, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            setMessage('✅ Utilisateur mis à jour avec succès');
            fetchUsers();
            setTimeout(() => setMessage(''), 2000);
        } catch (error) {
            console.error("Erreur modification utilisateur:", error);
            setMessage('❌ Erreur lors de la modification: ' + (error.response?.data?.error || error.message));
            setTimeout(() => setMessage(''), 3000);
        }
    };

    const deleteUser = async (userId) => {
        if (!window.confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) return;

        try {
            await axios.delete(`${FILMS_API}/users/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            setMessage('✅ Utilisateur supprimé avec succès');
            fetchUsers();
            setTimeout(() => setMessage(''), 2000);
        } catch (error) {
            console.error("Erreur suppression utilisateur:", error);
            setMessage('❌ Erreur lors de la suppression: ' + (error.response?.data?.error || error.message));
            setTimeout(() => setMessage(''), 3000);
        }
    };

    const fetchPopular = async (page = 1) => {
        setTmdbLoading(true);
        try {
            const response = await axios.get(`${FILMS_API}/tmdb/popular?page=${page}`, {
                timeout: 10000,
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            setTmdbResults(response.data.results || []);
            setTmdbPage(response.data.page || 1);
            setTmdbTotalPages(response.data.total_pages || 1);
        } catch (error) {
            console.error("Error fetching popular:", error);
            
            if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
                setMessage(`❌ API Films non accessible. Vérifiez la connexion au serveur ${FILMS_API}`);
            } else if (error.response?.status === 401) {
                setMessage('Token invalide ou expiré');
            } else {
                setMessage('Erreur lors du chargement des films populaires: ' + (error.response?.data?.error || error.message));
            }
            setTimeout(() => setMessage(''), 5000);
        } finally {
            setTmdbLoading(false);
        }
    };

    const searchTmdb = async (q, page = 1) => {
        if (!q) return setTmdbResults([]);
        setTmdbLoading(true);
        try {
            const response = await axios.get(
                `${FILMS_API}/tmdb/search?q=${encodeURIComponent(q)}&page=${page}`,
                {
                    timeout: 10000,
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                }
            );
            setTmdbResults(response.data.results || []);
            setTmdbPage(response.data.page || 1);
            setTmdbTotalPages(response.data.total_pages || 1);
        } catch (error) {
            console.error("Error searching TMDB:", error);
            
            if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
                setMessage(`❌ API Films non accessible`);
            } else if (error.response?.status === 401) {
                setMessage('Token invalide ou expiré');
            } else {
                setMessage('Erreur lors de la recherche: ' + (error.response?.data?.error || error.message));
            }
            setTimeout(() => setMessage(''), 5000);
        } finally {
            setTmdbLoading(false);
        }
    };

    useEffect(() => {
        const q = (tmdbQuery || '').trim();
        if (!q) {
            setTmdbResults([]);
            setTmdbPage(1);
            setTmdbTotalPages(1);
            return;
        }
        const id = setTimeout(() => {
            searchTmdb(q, 1);
        }, 350);
        return () => clearTimeout(id);
    }, [tmdbQuery]);

    const addFromTmdb = async (m) => {
        try {
            const exists = movies.find(f => String(f.id) === String(m.id) || String(f._id) === String(m.id));
            if (exists) {
                setMessage('⚠️ Film déjà ajouté');
                setTimeout(() => setMessage(''), 2000);
                return;
            }

            const payload = {
                _id: String(m.id),
                id: m.id,
                title: m.title,
                overview: m.overview,
                poster_path: m.poster_path,
                release_date: m.release_date,
                vote_average: m.vote_average
            };

            await axios.post(`${FILMS_API}/films`, payload, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            await fetchMovies();
            setMessage('✅ Film ajouté avec succès');
            setTmdbResults(prev => prev.filter(x => String(x.id) !== String(m.id)));
            setTimeout(() => setMessage(''), 2000);
        } catch (error) {
            console.error("Error adding movie:", error);
            if (error.response?.status === 403) {
                setMessage('❌ Action réservée aux administrateurs');
            } else {
                setMessage('❌ Erreur lors de l\'ajout: ' + (error.response?.data?.error || error.message));
            }
            setTimeout(() => setMessage(''), 2000);
        }
    };

    const addReview = (movieId) => {
        navigate(`/movie/${movieId}/review`);
    };

    const editMovie = async (movie) => {
        const newTitle = window.prompt('Titre', movie.title) || movie.title;
        const newOverview = window.prompt('Description', movie.overview) || movie.overview;
        const newReleaseDate = window.prompt('Date de sortie', movie.release_date) || movie.release_date;
        const newVoteAverage = window.prompt('Note', movie.vote_average) || movie.vote_average;

        try {
            const payload = {
                title: newTitle,
                overview: newOverview,
                release_date: newReleaseDate,
                vote_average: parseFloat(newVoteAverage),
                poster_path: movie.poster_path
            };

            await axios.put(`${FILMS_API}/films/${movie._id || movie.id}`, payload, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            setMessage('✅ Film mis à jour avec succès');
            setTimeout(() => setMessage(''), 2000);
            fetchMovies();
        } catch (error) {
            console.error("Error updating movie:", error);
            if (error.response?.status === 403) {
                setMessage('❌ Action réservée aux administrateurs');
            } else {
                setMessage('❌ Erreur lors de la mise à jour: ' + (error.response?.data?.error || error.message));
            }
            setTimeout(() => setMessage(''), 2000);
        }
    };

    const deleteMovie = async (movieId) => {
        if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce film ?')) return;

        try {
            await axios.delete(`${FILMS_API}/films/${movieId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            setMessage('✅ Film supprimé avec succès');
            setTimeout(() => setMessage(''), 2000);
            fetchMovies();
        } catch (error) {
            console.error("Error deleting movie:", error);
            if (error.response?.status === 403) {
                setMessage('❌ Action réservée aux administrateurs');
            } else {
                setMessage('❌ Erreur lors de la suppression: ' + (error.response?.data?.error || error.message));
            }
            setTimeout(() => setMessage(''), 2000);
        }
    };

    const handleLogout = () => {
        console.log("🚪 Déconnexion");
        localStorage.removeItem("token");
        setToken(null);
        navigate('/login', { replace: true });
    };

    if (loading) {
        return (
            <div style={{ textAlign: 'center', marginTop: '50px' }}>
                <p>Chargement...</p>
            </div>
        );
    }

    return (
        <div style={{ padding: '20px' }}>
            {/* Header */}
            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '20px',
                flexWrap: 'wrap',
                gap: '10px'
            }}>
                <div>
                    <h1 style={{ margin: 0 }}>🎬 Tous les Films</h1>
                    <small style={{ color: '#666' }}>
                        API: {FILMS_API} | 
                        Utilisateur: {isAdmin ? 'Admin' : 'User'} |
                        Token: {token ? '✓ Présent' : '✗ Absent'}
                    </small>
                </div>
                
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {message && (
                        <span style={{ 
                            color: message.includes('❌') || message.includes('⚠️') ? 'red' : 'green', 
                            marginRight: '10px',
                            fontWeight: 'bold',
                            padding: '8px 12px',
                            backgroundColor: message.includes('❌') || message.includes('⚠️') ? '#ffebee' : '#e8f5e9',
                            borderRadius: '4px',
                            fontSize: '0.9rem'
                        }}>
                            {message}
                        </span>
                    )}
                    
                    {isAdmin && (
                        <>
                            <button 
                                onClick={() => {
                                    setShowTmdbPanel(!showTmdbPanel);
                                    setShowUsersPanel(false);
                                }}
                                disabled={apiConnectionError}
                                style={{
                                    backgroundColor: apiConnectionError ? '#ccc' : (showTmdbPanel ? "#ff9800" : "#2196f3"),
                                    color: "white",
                                    padding: "8px 16px",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: apiConnectionError ? "not-allowed" : "pointer"
                                }}
                            >
                                {showTmdbPanel ? '❌ Fermer TMDB' : '🔎 Explorer TMDB'}
                            </button>
                            
                            <button 
                                onClick={() => {
                                    setShowDeletedPanel(!showDeletedPanel);
                                    setShowTmdbPanel(false);
                                    setShowUsersPanel(false);
                                    if (!showDeletedPanel) fetchDeletedFilms();
                                }}
                                style={{
                                    backgroundColor: showDeletedPanel ? "#ff9800" : "#607d8b",
                                    color: "white",
                                    padding: "8px 16px",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer"
                                }}
                            >
                                {showDeletedPanel ? '❌ Fermer Supprimés' : '🗄️ Films supprimés'}
                            </button>
                            
                            <button 
                                onClick={() => {
                                    setShowUsersPanel(!showUsersPanel);
                                    setShowTmdbPanel(false);
                                }}
                                style={{
                                    backgroundColor: showUsersPanel ? "#ff9800" : "#9c27b0",
                                    color: "white",
                                    padding: "8px 16px",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer"
                                }}
                            >
                                {showUsersPanel ? '❌ Fermer Users' : '👥 Gérer Users'}
                            </button>
                            <button
                                onClick={() => {
                                    setShowCommentsPanel(!showCommentsPanel);
                                    setShowTmdbPanel(false);
                                    setShowUsersPanel(false);
                                    setShowDeletedPanel(false);
                                    if (!showCommentsPanel) fetchComments();
                                }}
                                style={{
                                    backgroundColor: showCommentsPanel ? '#ff9800' : '#00796b',
                                    color: 'white',
                                    padding: '8px 16px',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                {showCommentsPanel ? '❌ Fermer Commentaires' : '💬 Tous les commentaires'}
                            </button>
                        </>
                    )}
                    
                    <button 
                        onClick={handleLogout}
                        style={{
                            backgroundColor: "#d32f2f",
                            color: "white",
                            padding: "8px 16px",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer"
                        }}
                    >
                        🚪 Déconnexion
                    </button>
                </div>
            </div>

            {/* Alert si API non accessible */}
            {apiConnectionError && (
                <div style={{
                    backgroundColor: '#ffebee',
                    border: '2px solid #f44336',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                }}>
                    <span style={{ fontSize: '2rem' }}>⚠️</span>
                    <div>
                        <strong>Connexion à l'API impossible</strong>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem' }}>
                            Vérifiez que le serveur backend est démarré sur <code>{FILMS_API}</code>
                        </p>
                    </div>
                    <button 
                        onClick={fetchMovies}
                        style={{
                            marginLeft: 'auto',
                            backgroundColor: '#2196f3',
                            color: 'white',
                            padding: '8px 16px',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        🔄 Réessayer
                    </button>
                </div>
            )}

            {/* Recherche utilisateur (visible pour les users) */}
            {!isAdmin && (
                <div style={{
                    border: '2px solid #e0e0e0',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '20px',
                    backgroundColor: '#fafafa'
                }}>
                    <h3 style={{ marginTop: 0 }}>🔎 Rechercher un film à noter</h3>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                        <input
                            placeholder="Tapez le titre..."
                            value={userQuery}
                            onChange={e => setUserQuery(e.target.value)}
                            style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                        />
                        <button
                            onClick={() => searchForUser(userQuery, 1)}
                            disabled={!userQuery || userLoading}
                            style={{ backgroundColor: '#1976d2', color: 'white', padding: '10px 16px', border: 'none', borderRadius: '6px', cursor: !userQuery || userLoading ? 'not-allowed' : 'pointer' }}
                        >
                            {userLoading ? 'Recherche...' : 'Rechercher'}
                        </button>
                    </div>

                    {userResults && userResults.length > 0 && (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                            gap: '12px'
                        }}>
                            {userResults.map(m => (
                                <div key={m.id} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '8px', background: 'white', textAlign: 'center' }}>
                                    {m.poster_path ? (
                                        <img src={`https://image.tmdb.org/t/p/w200${m.poster_path}`} alt={m.title} style={{ width: '100%', borderRadius: '6px', marginBottom: '8px' }} />
                                    ) : (
                                        <div style={{ height: '180px', background: '#eee', borderRadius: '6px', marginBottom: '8px' }} />
                                    )}
                                    <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '6px' }}>{m.title}</div>
                                    <div style={{ color: '#666', fontSize: '12px', marginBottom: '8px' }}>{m.release_date || ''}</div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button onClick={() => addReview(m.id)} style={{ flex: 1, backgroundColor: '#5e35b1', color: 'white', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}>Noter</button>
                                        <button onClick={() => navigate(`/movie/${m.id}`)} style={{ flex: 1, backgroundColor: '#9c27b0', color: 'white', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}>Détails</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Panel Gestion des Utilisateurs pour les admins */}
            {isAdmin && showUsersPanel && (
                <div style={{
                    border: '2px solid #9c27b0',
                    borderRadius: '8px',
                    padding: '20px',
                    marginBottom: '30px',
                    backgroundColor: '#f3e5f5'
                }}>
                    <h2 style={{ marginTop: 0, color: '#7b1fa2' }}>👥 Gestion des Utilisateurs</h2>
                    
                    {/* Formulaire de création d'utilisateur */}
                    <form onSubmit={createUser} style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                        gap: '10px',
                        marginBottom: '20px',
                        padding: '15px',
                        backgroundColor: 'white',
                        borderRadius: '6px'
                    }}>
                        <input 
                            placeholder="Nom"
                            value={userForm.nom}
                            onChange={e => setUserForm({...userForm, nom: e.target.value})}
                            style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                            required
                        />
                        <input 
                            placeholder="Prénom"
                            value={userForm.prenom}
                            onChange={e => setUserForm({...userForm, prenom: e.target.value})}
                            style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                            required
                        />
                        <input 
                            placeholder="Email"
                            type="email"
                            value={userForm.email}
                            onChange={e => setUserForm({...userForm, email: e.target.value})}
                            style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                            required
                        />
                        <input 
                            placeholder="Mot de passe"
                            type="password"
                            value={userForm.password}
                            onChange={e => setUserForm({...userForm, password: e.target.value})}
                            style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                            required
                        />
                        <select 
                            value={userForm.role}
                            onChange={e => setUserForm({...userForm, role: e.target.value})}
                            style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                        >
                            <option value="user">Utilisateur</option>
                            <option value="admin">Administrateur</option>
                        </select>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button type="submit" style={{
                                backgroundColor: '#4caf50',
                                color: 'white',
                                padding: '8px 16px',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                flex: 1
                            }}>
                                Créer Utilisateur
                            </button>
                            <button type="button" onClick={createAdmin} style={{
                                backgroundColor: '#d32f2f',
                                color: 'white',
                                padding: '8px 16px',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                flex: 1
                            }}>
                                Créer Admin
                            </button>
                        </div>
                    </form>

                    {/* Liste des utilisateurs */}
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ 
                            width: '100%', 
                            borderCollapse: 'collapse',
                            backgroundColor: 'white',
                            borderRadius: '6px',
                            overflow: 'hidden'
                        }}>
                            <thead>
                                <tr style={{ backgroundColor: '#7b1fa2', color: 'white' }}>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>ID</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Nom</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Prénom</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Email</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Rôle</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(user => (
                                    <tr key={user.id} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '12px' }}>{user.id}</td>
                                        <td style={{ padding: '12px' }}>{user.nom}</td>
                                        <td style={{ padding: '12px' }}>{user.prenom}</td>
                                        <td style={{ padding: '12px' }}>{user.email}</td>
                                        <td style={{ padding: '12px' }}>
                                            <span style={{
                                                padding: '4px 8px',
                                                borderRadius: '12px',
                                                fontSize: '0.8rem',
                                                backgroundColor: user.role === 'admin' ? '#ffebee' : '#e8f5e9',
                                                color: user.role === 'admin' ? '#c62828' : '#2e7d32'
                                            }}>
                                                {user.role}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <button 
                                                onClick={() => editUser(user)}
                                                style={{
                                                    backgroundColor: '#ff9800',
                                                    color: 'white',
                                                    padding: '6px 12px',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    marginRight: '8px'
                                                }}
                                            >
                                                ✏️ Modifier
                                            </button>
                                            <button 
                                                onClick={() => deleteUser(user.id)}
                                                style={{
                                                    backgroundColor: '#f44336',
                                                    color: 'white',
                                                    padding: '6px 12px',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                🗑️ Supprimer
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Panel Films Supprimés (admin) */}
            {isAdmin && showDeletedPanel && (
                <div style={{
                    border: '2px solid #607d8b',
                    borderRadius: '8px',
                    padding: '20px',
                    marginBottom: '30px',
                    backgroundColor: '#fafafa'
                }}>
                    <h2 style={{ marginTop: 0 }}>🗄️ Films Supprimés</h2>
                    {deletedLoading ? (
                        <p>Chargement...</p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '6px', overflow: 'hidden' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#607d8b', color: 'white' }}>
                                        <th style={{ padding: '12px', textAlign: 'left' }}>ID</th>
                                        <th style={{ padding: '12px', textAlign: 'left' }}>Titre</th>
                                        <th style={{ padding: '12px', textAlign: 'left' }}>Date</th>
                                        <th style={{ padding: '12px', textAlign: 'left' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {deletedFilms.length === 0 ? (
                                        <tr><td style={{ padding: '12px' }} colSpan={4}>Aucun film supprimé</td></tr>
                                    ) : deletedFilms.map(df => (
                                        <tr key={df._id || df.id} style={{ borderBottom: '1px solid #eee' }}>
                                            <td style={{ padding: '12px' }}>{df._id || df.id}</td>
                                            <td style={{ padding: '12px' }}>{df.title}</td>
                                            <td style={{ padding: '12px' }}>{df.release_date || ''}</td>
                                            <td style={{ padding: '12px' }}>
                                                <button onClick={() => restoreDeleted(String(df._id || df.id))} style={{ backgroundColor: '#4caf50', color: 'white', padding: '6px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                                    ♻️ Restaurer
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Panel Commentaires (admin) */}
            {isAdmin && showCommentsPanel && (
                <div style={{
                    border: '2px solid #00796b',
                    borderRadius: '8px',
                    padding: '20px',
                    marginBottom: '30px',
                    backgroundColor: '#f1f8f7'
                }}>
                    <h2 style={{ marginTop: 0 }}>💬 Tous les Commentaires</h2>
                    {commentsLoading ? (
                        <p>Chargement des commentaires...</p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '6px', overflow: 'hidden' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#00796b', color: 'white' }}>
                                        <th style={{ padding: '12px', textAlign: 'left' }}>ID</th>
                                        <th style={{ padding: '12px', textAlign: 'left' }}>Film</th>
                                        <th style={{ padding: '12px', textAlign: 'left' }}>Auteur</th>
                                        <th style={{ padding: '12px', textAlign: 'left' }}>Note</th>
                                        <th style={{ padding: '12px', textAlign: 'left', width: '40%' }}>Commentaire</th>
                                        <th style={{ padding: '12px', textAlign: 'left' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {comments.length === 0 ? (
                                        <tr><td style={{ padding: '12px' }} colSpan={6}>Aucun commentaire</td></tr>
                                    ) : comments.map(c => (
                                        <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                                            <td style={{ padding: '12px' }}>{c.id}</td>
                                            <td style={{ padding: '12px' }}>{c.title || `#${c.movie_id}`}</td>
                                            <td style={{ padding: '12px' }}>{c.user_email}</td>
                                            <td style={{ padding: '12px' }}>{c.rating || '-'}</td>
                                            <td style={{ padding: '12px' }}>{c.comment}</td>
                                            <td style={{ padding: '12px' }}>
                                                <button onClick={() => deleteComment(c.id)} style={{ backgroundColor: '#f44336', color: 'white', padding: '6px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                                    🗑️ Supprimer
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Panel TMDB pour les admins */}
            {isAdmin && showTmdbPanel && (
                <div style={{
                    border: '2px solid #2196f3',
                    borderRadius: '8px',
                    padding: '20px',
                    marginBottom: '30px',
                    backgroundColor: '#f5f5f5'
                }}>
                    <h2 style={{ marginTop: 0 }}>📽️ Catalogue TMDB</h2>
                    
                    <div style={{ marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <button 
                                onClick={() => { 
                                    setTmdbMode('search'); 
                                    setTmdbResults([]); 
                                    setTmdbPage(1); 
                                }}
                                style={{
                                    backgroundColor: '#2196f3',
                                    color: 'white',
                                    padding: '8px 16px',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                🔍 Rechercher
                            </button>
                    </div>

                    {tmdbMode === 'search' && (
                        <div style={{ marginBottom: '16px', display: 'flex', gap: '10px' }}>
                            <input 
                                placeholder="Rechercher un film sur TMDB..." 
                                value={tmdbQuery} 
                                onChange={e => setTmdbQuery(e.target.value)}
                                style={{ 
                                    flex: 1, 
                                    padding: '10px',
                                    borderRadius: '4px',
                                    border: '1px solid #ddd'
                                }} 
                            />
                            <button 
                                onClick={() => searchTmdb(tmdbQuery, 1)}
                                style={{
                                    backgroundColor: '#4caf50',
                                    color: 'white',
                                    padding: '10px 20px',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                Rechercher
                            </button>
                        </div>
                    )}

                    {tmdbLoading ? (
                        <div style={{ textAlign: 'center', padding: '20px' }}>
                            <div style={{ 
                                display: 'inline-block',
                                width: '40px',
                                height: '40px',
                                border: '4px solid #f3f3f3',
                                borderTop: '4px solid #2196f3',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite'
                            }}></div>
                            <p>Chargement des films...</p>
                        </div>
                    ) : (
                        <>
                            <div style={{ 
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                                gap: '15px',
                                marginBottom: '16px'
                            }}>
                                {tmdbResults.map(m => (
                                    <div key={m.id} style={{
                                        border: '1px solid #ddd',
                                        borderRadius: '8px',
                                        padding: '10px',
                                        textAlign: 'center',
                                        backgroundColor: 'white',
                                        transition: 'transform 0.2s, box-shadow 0.2s',
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.transform = 'translateY(-4px)';
                                        e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = 'none';
                                    }}>
                                        {m.poster_path ? (
                                            <img 
                                                src={`https://image.tmdb.org/t/p/w200${m.poster_path}`} 
                                                alt={m.title} 
                                                style={{ 
                                                    width: '100%', 
                                                    borderRadius: '6px',
                                                    marginBottom: '8px'
                                                }} 
                                            />
                                        ) : (
                                            <div style={{ 
                                                width: '100%', 
                                                height: '240px', 
                                                background: '#ccc',
                                                borderRadius: '6px',
                                                marginBottom: '8px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>🎬</div>
                                        )}
                                        <div style={{ fontSize: '13px', marginBottom: '8px', fontWeight: 'bold' }}>
                                            {m.title}
                                        </div>
                                        <button 
                                            onClick={() => deleteMovie(String(m.id))}
                                            style={{
                                                backgroundColor: '#f44336',
                                                color: 'white',
                                                padding: '6px 12px',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                width: '100%'
                                            }}
                                        >
                                            🗑️ Supprimer
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {tmdbResults.length === 0 && tmdbMode === 'search' && tmdbQuery && (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                                    <p>Aucun résultat pour "{tmdbQuery}"</p>
                                </div>
                            )}

                            {tmdbResults.length > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', alignItems: 'center' }}>
                                    <button 
                                        onClick={() => {
                                            const newPage = Math.max(1, tmdbPage - 1);
                                            setTmdbPage(newPage);
                                            searchTmdb(tmdbQuery, newPage);
                                        }}
                                        disabled={tmdbPage <= 1}
                                        style={{
                                            backgroundColor: tmdbPage <= 1 ? '#ccc' : '#2196f3',
                                            color: 'white',
                                            padding: '8px 16px',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: tmdbPage <= 1 ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        ← Précédent
                                    </button>
                                    <span>Page {tmdbPage} / {tmdbTotalPages}</span>
                                    <button 
                                        onClick={() => {
                                            const newPage = Math.min(tmdbTotalPages, tmdbPage + 1);
                                            setTmdbPage(newPage);
                                            searchTmdb(tmdbQuery, newPage);
                                        }}
                                        disabled={tmdbPage >= tmdbTotalPages}
                                        style={{
                                            backgroundColor: tmdbPage >= tmdbTotalPages ? '#ccc' : '#2196f3',
                                            color: 'white',
                                            padding: '8px 16px',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: tmdbPage >= tmdbTotalPages ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        Suivant →
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {}
            <h2>📚 Ma Collection ({movies.length})</h2>
            <ul style={{ 
                listStyle: 'none', 
                padding: 0,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '20px'
            }}>
                {movies.length > 0 ? (
                    movies.map(movie => (
                        <li key={movie.id || movie._id} style={{
                            border: '1px solid #ddd',
                            borderRadius: '8px',
                            padding: '16px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                            transition: 'transform 0.2s',
                        }}>
                            {movie.poster_path ? (
                                <img 
                                    src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`} 
                                    alt={movie.title} 
                                    style={{ 
                                        width: "100%", 
                                        height: "400px", 
                                        objectFit: "cover",
                                        borderRadius: "6px",
                                        marginBottom: "10px"
                                    }} 
                                />
                            ) : (
                                <div style={{ 
                                    width: "100%", 
                                    height: "400px", 
                                    background: "#ccc",
                                    borderRadius: "6px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    marginBottom: "10px"
                                }}>
                                    
                                </div>
                            )}
                            
                            <h2 style={{ 
                                fontSize: '1.2rem', 
                                marginBottom: '8px',
                                color: '#333'
                            }}>
                                {movie.title}
                            </h2>
                            
                            {movie.overview && (
                                <p style={{ 
                                    fontSize: '0.9rem', 
                                    color: '#666',
                                    marginBottom: '8px',
                                    lineHeight: '1.4'
                                }}>
                                    {movie.overview.substring(0, 150)}
                                    {movie.overview.length > 150 ? '...' : ''}
                                </p>
                            )}
                            
                            <div style={{ 
                                display: 'flex', 
                                gap: '10px', 
                                fontSize: '0.9rem',
                                marginBottom: '12px',
                                color: '#555'
                            }}>
                                {movie.release_date && (
                                    <p style={{ margin: 0 }}>
                                        📅 {movie.release_date}
                                    </p>
                                )}
                                {movie.vote_average && (
                                    <p style={{ margin: 0 }}>
                                        ⭐ {movie.vote_average}/10
                                    </p>
                                )}
                            </div>
                            
                            <div style={{ 
                                display: 'flex', 
                                gap: '8px',
                                flexWrap: 'wrap'
                            }}>
                                {!isAdmin ? (
                                    <>
                                    <button 
                                            onClick={() => addReview(movie.id || movie._id)}
                                            style={{
                                                backgroundColor: "#5e35b1",
                                                color: "white",
                                                padding: "8px 12px",
                                                border: "none",
                                                borderRadius: "4px",
                                                cursor: "pointer",
                                                flex: 1
                                            }}
                                        >
                                             Ajouter une Critique
                                        </button>
                                        <button 
                                            onClick={() => navigate(`/movie/${movie.id || movie._id}`)}
                                            style={{
                                                backgroundColor: "#5e35b1",
                                                color: "white",
                                                padding: "8px 12px",
                                                border: "none",
                                                borderRadius: "4px",
                                                cursor: "pointer",
                                                flex: 1
                                            }}
                                        >
                                             Voir le detail du film
                                        </button>
                                        </>
                                        

                                ) : (
                                    <>
                                        <button 
                                            onClick={() => addReview(movie.id || movie._id)}
                                            style={{
                                                backgroundColor: "#5e35b1",
                                                color: "white",
                                                padding: "8px 12px",
                                                border: "none",
                                                borderRadius: "4px",
                                                cursor: "pointer",
                                                flex: 1
                                            }}
                                        >
                                            ✏️ Critique
                                        </button>
                                        <button 
                                            onClick={() => editMovie(movie)}
                                            style={{
                                                backgroundColor: "#ff9800",
                                                color: "white",
                                                padding: "8px 12px",
                                                border: "none",
                                                borderRadius: "4px",
                                                cursor: "pointer",
                                                flex: 1
                                            }}
                                        >
                                            ✏️ Modifier
                                        </button>
                                        <button 
                                            onClick={() => deleteMovie(movie._id || movie.id)}
                                            style={{
                                                backgroundColor: "#f44336",
                                                color: "white",
                                                padding: "8px 12px",
                                                border: "none",
                                                borderRadius: "4px",
                                                cursor: "pointer",
                                                flex: 1
                                            }}
                                        >
                                            🗑️ Supprimer
                                        </button>
                                    </>
                                )}
                            </div>
                        </li>
                    ))
                ) : (
                    <p style={{ 
                        textAlign: 'center', 
                        gridColumn: '1 / -1',
                        fontSize: '1.2rem',
                        color: '#999',
                        marginTop: '40px'
                    }}>
                        📽️ Aucun film disponible
                        {isAdmin && <><br /><span style={{ fontSize: '0.9rem' }}>Cliquez sur "➕ Ajouter des films" pour commencer</span></>}
                    </p>
                )}
            </ul>
            {}
            <div style={{ textAlign: 'center', marginTop: '20px' }}>
                <button
                    onClick={() => {
                        const next = catalogPages + 1;
                        setCatalogPages(next);
                        fetchMovies(next, true);
                    }}
                    disabled={apiConnectionError || loadingMore}
                    style={{
                        backgroundColor: apiConnectionError ? '#ccc' : '#1976d2',
                        color: 'white',
                        padding: '10px 18px',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: apiConnectionError ? 'not-allowed' : 'pointer'
                    }}
                >
                    {loadingMore ? 'Chargement...' : '🔽 Charger plus de films'}
                </button>
            </div>
        </div>
    );
};

export default Home;