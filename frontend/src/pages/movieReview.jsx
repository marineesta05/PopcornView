import { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import { getCsrfToken } from '../utils/csrf';

const AddReview = () => {
    const navigate = useNavigate();
    const { movieId } = useParams();
    const [token, setToken] = useState(null);

    const MAX_COMMENT = 500;

    const [formData, setFormData] = useState({
        rating: "",
        comment: "",
    });

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [loading, setLoading] = useState(false);


    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'comment') {
            const v = value && value.length > MAX_COMMENT ? value.slice(0, MAX_COMMENT) : value;
            setFormData({ ...formData, [name]: v });
            if (error && v.trim().length <= MAX_COMMENT) setError("");
        } else {
            setFormData({ ...formData, [name]: value });
        }
    };

    const handleReconnect = () => {
        navigate("/login");
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");


        setLoading(true);

        if (!formData.rating || formData.rating < 1 || formData.rating > 5) {
            setError("La note doit être entre 1 et 5");
            setLoading(false);
            return;
        }

        if (!formData.comment.trim()) {
            setError("Le commentaire est requis");
            setLoading(false);
            return;
        }

        if (formData.comment.trim().length > MAX_COMMENT) {
            setError(`Le commentaire ne doit pas dépasser ${MAX_COMMENT} caractères`);
            setLoading(false);
            return;
        }

        try {
            const headers = { 'Content-Type': 'application/json' };
            const csrf = getCsrfToken(); if (csrf) headers['x-csrf-token'] = csrf;
            const response = await axios.post(
                "http://localhost:3003/reviews",
                {
                    movie_id: parseInt(movieId),
                    rating: parseInt(formData.rating),
                    comment: formData.comment.trim()
                },
                {
                    withCredentials: true,
                    headers
                }
            );
            
            if (response.status === 201) {
                setSuccess("Avis ajouté avec succès!");
                setTimeout(() => {
                    navigate(`/movie/${movieId}`); 
                }, 1500);
            }
        } catch (err) {
            console.error("Erreur:", err.response?.data);
            
            if (err.response?.status === 401 || err.response?.data?.message === "Token invalide") {
                setError("Session expirée. Veuillez vous reconnecter.");
                localStorage.removeItem("token");
                setToken(null);
            } else if (err.response?.data?.message) {
                setError(err.response.data.message);
            } else {
                setError("Une erreur est survenue. Veuillez réessayer.");
            }
        } finally {
            setLoading(false);
        }
    };

    if (!token) {
        return (
            <div style={{ 
                maxWidth: "500px", 
                margin: "50px auto", 
                padding: "20px", 
                textAlign: "center",
                border: "1px solid #ddd",
                borderRadius: "8px"
            }}>
                <h2>Connexion requise</h2>
                <p>Vous devez être connecté pour ajouter un avis.</p>
                <button 
                    onClick={handleReconnect}
                    style={{
                        backgroundColor: "#5e35b1",
                        color: "white",
                        padding: "10px 20px",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        marginTop: "15px"
                    }}
                >
                    Se connecter
                </button>
            </div>
        );
    }

    return (
        <div className="add-review" style={{ maxWidth: "600px", margin: "0 auto", padding: "20px" }}>
            <h2>Ajouter un avis pour le film #{movieId}</h2>
            
            {error && (
                <div style={{ 
                    color: "red", 
                    backgroundColor: "#ffe6e6", 
                    padding: "15px", 
                    borderRadius: "4px",
                    marginBottom: "15px",
                    border: "1px solid #ffcccc"
                }}>
                    <strong>Erreur:</strong> {error}
                    {(error.includes("Token") || error.includes("session")) && (
                        <div style={{ marginTop: "10px" }}>
                            <button 
                                onClick={handleReconnect}
                                style={{
                                    backgroundColor: "#5e35b1",
                                    color: "white",
                                    padding: "8px 16px",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer"
                                }}
                            >
                                Se reconnecter
                            </button>
                        </div>
                    )}
                </div>
            )}
            
            {success && (
                <div style={{ 
                    color: "green", 
                    backgroundColor: "#e6ffe6", 
                    padding: "15px", 
                    borderRadius: "4px",
                    marginBottom: "15px",
                    border: "1px solid #ccffcc"
                }}>
                    <strong>Succès:</strong> {success}
                </div>
            )}
            
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                <div>
                    <label htmlFor="rating" style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
                        Note (1-5) :
                    </label>
                    <input
                        type="number"
                        id="rating"
                        name="rating"
                        min="1"
                        max="5"
                        value={formData.rating}
                        onChange={handleChange}
                        required
                        disabled={loading}
                        style={{ 
                            width: "100%", 
                            padding: "10px", 
                            border: "1px solid #ddd", 
                            borderRadius: "4px",
                            fontSize: "16px"
                        }}
                    />
                </div>

                <div>
                    <label htmlFor="comment" style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>
                        Commentaire :
                    </label>
                    <textarea
                        id="comment"
                        name="comment"
                        rows="5"
                        value={formData.comment}
                        maxLength={MAX_COMMENT}
                        onChange={handleChange}
                        required
                        disabled={loading}
                        placeholder="Partagez votre avis sur ce film..."
                        style={{ 
                            width: "100%", 
                            padding: "10px", 
                            border: "1px solid #ddd", 
                            borderRadius: "4px",
                            resize: "vertical",
                            fontSize: "16px"
                        }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                        <small style={{ color: formData.comment.length > MAX_COMMENT ? 'red' : '#666' }}>{formData.comment.length}/{MAX_COMMENT}</small>
                        {formData.comment.length > MAX_COMMENT && (
                            <small style={{ color: 'red' }}>Trop long ({formData.comment.length - MAX_COMMENT} caractères en trop)</small>
                        )}
                    </div>
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                    <button 
                        type="submit" 
                        disabled={loading}
                        style={{
                            backgroundColor: loading ? "#ccc" : "#5e35b1",
                            color: "white",
                            padding: "12px 20px",
                            border: "none",
                            borderRadius: "4px",
                            cursor: loading ? "not-allowed" : "pointer",
                            flex: 1,
                            fontSize: "16px"
                        }}
                    >
                        {loading ? "Publication..." : "Publier l'avis"}
                    </button>
                    
                    <button 
                        type="button" 
                        onClick={() => navigate(`/home`)}
                        disabled={loading}
                        style={{
                            backgroundColor: "#6c757d",
                            color: "white",
                            padding: "12px 20px",
                            border: "none",
                            borderRadius: "4px",
                            cursor: loading ? "not-allowed" : "pointer",
                            flex: 1,
                            fontSize: "16px"
                        }}
                    >
                        Annuler
                    </button>
                </div>
            </form>
        </div>
    );
};

export default AddReview;