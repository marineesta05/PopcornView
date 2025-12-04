import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

const PAGE_SIZE = 8;

// ✅ Configuration centralisée des URLs
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4001';

export default function MovieDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [movie, setMovie] = useState(null);
    const [reviews, setReviews] = useState([]);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMovie, setLoadingMovie] = useState(false);
    const [loadingReviews, setLoadingReviews] = useState(false);
    const [error, setError] = useState(null);

    //  Helper pour créer les options de fetch avec authentification
    const getFetchOptions = () => {
        return {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
            }
        };
    };

    //  Fetch movie details
    useEffect(() => {
        if (!id) return;
        
        const fetchMovie = async () => {
            setLoadingMovie(true);
            setError(null);
            
            try {
                const response = await fetch(
                    `${API_BASE_URL}/api/movies/${id}`, 
                    getFetchOptions()
                );
                
                if (response.status === 401) {
                    navigate('/login');
                    return;
                }
                
                if (!response.ok) {
                    throw new Error(`Failed to load movie: ${response.status}`);
                }
                
                const data = await response.json();
                setMovie(data);
            } catch (err) {
                console.error('Error loading movie:', err);
                setError(err.message || "Error loading movie");
            } finally {
                setLoadingMovie(false);
            }
        };

        fetchMovie();
    }, [id, navigate]);

    //  Fetch reviews on mount
    useEffect(() => {
        if (!id) return;
        
        setReviews([]);
        setPage(0);
        setHasMore(true);
        loadReviews(0);
    }, [id]);

    //  Load reviews with pagination
    async function loadReviews(pageToLoad) {
        if (!id || loadingReviews || !hasMore) return;
        
        setLoadingReviews(true);
        
        try {
            const response = await fetch(
                `${API_BASE_URL}/api/movies/${id}/reviews`, 
                getFetchOptions()
            );
            
            if (response.status === 401) {
                navigate('/login');
                return;
            }
            
            if (!response.ok) {
                throw new Error(`Failed to load reviews: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!Array.isArray(data)) {
                console.warn("Invalid reviews response, expected array:", data);
                setHasMore(false);
                return;
            }
            
            // Pagination côté client
            const startIndex = pageToLoad * PAGE_SIZE;
            const paginatedData = data.slice(startIndex, startIndex + PAGE_SIZE);
            
            setReviews((prev) => [...prev, ...paginatedData]);
            
            // Vérifier s'il reste des reviews
            if (paginatedData.length < PAGE_SIZE || startIndex + PAGE_SIZE >= data.length) {
                setHasMore(false);
            }
            
            setPage(pageToLoad);
        } catch (err) {
            console.error('Error loading reviews:', err);
            setError(err.message || "Error loading reviews");
            setHasMore(false);
        } finally {
            setLoadingReviews(false);
        }
    }

    function loadMore() {
        loadReviews(page + 1);
    }

    // Calcul de la note moyenne
    function averageRating() {
        if (movie && (movie.vote_average || movie.vote_average === 0)) {
            return Number(movie.vote_average).toFixed(1);
        }
        if (!reviews.length) return "—";
        const sum = reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0);
        return (sum / reviews.length).toFixed(1);
    }

    const handleAddReview = () => {
        navigate(`/movie/${id}/review`);
    };

    //  États de chargement et d'erreur
    if (loadingMovie) {
        return (
            <div style={{ textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: '1.2em', color: '#666' }}>Loading movie...</div>
            </div>
        );
    }

    if (error && !movie) {
        return (
            <div style={{ 
                color: 'red', 
                textAlign: 'center', 
                padding: '40px',
                maxWidth: '600px',
                margin: '0 auto'
            }}>
                <h2>Error Loading Movie</h2>
                <p>{error}</p>
                <button 
                    onClick={() => navigate('/home')}
                    style={{
                        padding: "10px 20px",
                        backgroundColor: "#5e35b1",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        marginTop: '20px'
                    }}
                >
                    Back to Home
                </button>
            </div>
        );
    }

    if (!movie) {
        return (
            <div style={{ textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: '1.2em', color: '#666' }}>No movie found</div>
                <button 
                    onClick={() => navigate('/home')}
                    style={{
                        padding: "10px 20px",
                        backgroundColor: "#5e35b1",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        marginTop: '20px'
                    }}
                >
                    Back to Home
                </button>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 980, margin: "24px auto", padding: 16 }}>
            {/* Movie Details Section */}
            <div style={{ display: "flex", gap: 20, flexWrap: 'wrap' }}>
                <img
                    src={movie.poster || "/placeholder-poster.png"}
                    alt={movie.title}
                    onError={(e) => { e.target.src = "/placeholder-poster.png"; }}
                    style={{ 
                        width: 260, 
                        height: 'auto', 
                        borderRadius: 6, 
                        objectFit: "cover",
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}
                />
                <div style={{ flex: 1, minWidth: 300 }}>
                    <h1 style={{ margin: "0 0 8px 0" }}>{movie.title}</h1>
                    
                    <div style={{ color: "#666", marginBottom: 8 }}>
                        {movie.genre && <span style={{ marginRight: 12 }}>Genre: {movie.genre}</span>}
                        {movie.duration && <span>Duration: {movie.duration} min</span>}
                    </div>
                    
                    <div style={{ marginBottom: 12 }}>
                        <strong>Average rating:</strong>{" "}
                        <span style={{ 
                            background: "#ffeb3b", 
                            padding: "4px 12px", 
                            borderRadius: 4,
                            fontWeight: 'bold'
                        }}>
                            ⭐ {averageRating()}
                        </span>
                    </div>
                    
                    <div style={{ marginBottom: 16 }}>
                        <button 
                            onClick={handleAddReview}
                            style={{
                                padding: "10px 20px",
                                backgroundColor: "#5e35b1",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontSize: '1em',
                                fontWeight: '500'
                            }}
                            onMouseOver={(e) => e.target.style.backgroundColor = "#4527a0"}
                            onMouseOut={(e) => e.target.style.backgroundColor = "#5e35b1"}
                            onFocus={(e) => e.target.style.backgroundColor = "#4527a0"}
                            onBlur={(e) => e.target.style.backgroundColor = "#5e35b1"}
                        >
                            ✍️ Add Review
                        </button>
                    </div>

                    <div>
                        <h3 style={{ marginBottom: 6 }}>Description</h3>
                        <p style={{ 
                            marginTop: 0, 
                            lineHeight: 1.6,
                            color: '#444'
                        }}>
                            {movie.description || "No description available."}
                        </p>
                    </div>
                </div>
            </div>

            {/* Reviews Section */}
            <section style={{ marginTop: 40 }}>
                <h2 style={{ marginBottom: 16 }}>
                    Reviews {reviews.length > 0 && `(${reviews.length})`}
                </h2>
                
                {reviews.length === 0 && !loadingReviews && (
                    <div style={{ 
                        textAlign: 'center', 
                        color: '#666', 
                        padding: '40px',
                        backgroundColor: '#f9f9f9',
                        borderRadius: '8px'
                    }}>
                        No reviews yet. Be the first to review!
                    </div>
                )}
                
                <div style={{ listStyle: "none", padding: 0 }}>
                    {reviews.map((r, i) => (
                        <div
                            key={r.id || i}
                            style={{
                                borderTop: "1px solid #e6e6e6",
                                paddingTop: 16,
                                paddingBottom: 16,
                            }}
                        >
                            <div style={{ 
                                display: "flex", 
                                justifyContent: "space-between", 
                                marginBottom: 8, 
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: '8px'
                            }}>
                                <div style={{ 
                                    fontWeight: 600, 
                                    fontSize: '1.1em',
                                    color: '#333'
                                }}>
                                    {r.author || "Anonymous"}
                                </div>
                                <div style={{ 
                                    color: "#444", 
                                    fontWeight: 'bold',
                                    background: '#f0f0f0',
                                    padding: '4px 12px',
                                    borderRadius: '4px'
                                }}>
                                    ⭐ {r.rating}/5
                                </div>
                            </div>
                            <div style={{ 
                                color: "#333", 
                                lineHeight: 1.5, 
                                marginBottom: 8 
                            }}>
                                {r.comment}
                            </div>
                            {r.created_at && (
                                <div style={{ color: "#999", fontSize: '0.9em' }}>
                                    {new Date(r.created_at).toLocaleDateString('en-US', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    })}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Load More Button */}
                <div style={{ marginTop: 20, textAlign: 'center' }}>
                    {hasMore ? (
                        <button
                            onClick={loadMore}
                            disabled={loadingReviews}
                            style={{
                                padding: "10px 20px",
                                borderRadius: 6,
                                border: "1px solid #ccc",
                                background: loadingReviews ? "#f0f0f0" : "#fff",
                                cursor: loadingReviews ? "not-allowed" : "pointer",
                                opacity: loadingReviews ? 0.6 : 1,
                                fontSize: '1em'
                            }}
                        >
                            {loadingReviews ? "Loading..." : "Load more reviews"}
                        </button>
                    ) : (
                        reviews.length > 0 && (
                            <div style={{ 
                                color: "#666", 
                                fontStyle: 'italic',
                                padding: '10px'
                            }}>
                                All reviews loaded.
                            </div>
                        )
                    )}
                </div>

                {error && reviews.length > 0 && (
                    <div style={{ 
                        marginTop: 12, 
                        color: "crimson", 
                        textAlign: 'center',
                        padding: '10px',
                        backgroundColor: '#fee',
                        borderRadius: '4px'
                    }}>
                        Error: {error}
                    </div>
                )}
            </section>

            {/* Back Button */}
            <div style={{ marginTop: 40 }}>
                <button 
                    onClick={() => navigate('/home')}
                    style={{
                        padding: "10px 20px",
                        backgroundColor: "#5e35b1",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: '1em'
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = "#4527a0"}
                    onMouseOut={(e) => e.target.style.backgroundColor = "#5e35b1"}
                    onFocus={(e) => e.target.style.backgroundColor = "#4527a0"}
                    onBlur={(e) => e.target.style.backgroundColor = "#5e35b1"}
                >
                    ← Back to Movies
                </button>
            </div>
        </div>
    );
}