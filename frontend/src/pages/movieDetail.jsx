import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

const PAGE_SIZE = 8;

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

    // Récupérer le token du localStorage
    const getAuthToken = () => {
        return localStorage.getItem('token');
    };

    // Fetch movie details
    useEffect(() => {
        if (!id) return;
        
        const fetchMovie = async () => {
            setLoadingMovie(true);
            setError(null);
            
            try {
                const token = getAuthToken();
                const response = await fetch(`http://localhost:4000/api/movies/${id}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (!response.ok) {
                    throw new Error("Failed to load movie");
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
    }, [id]);

    // Fetch reviews
    useEffect(() => {
        if (!id) return;
        
        setReviews([]);
        setPage(0);
        setHasMore(true);
        loadReviews(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    async function loadReviews(pageToLoad) {
        if (!id || loadingReviews || !hasMore) return;
        
        setLoadingReviews(true);
        setError(null);
        
        try {
            const token = getAuthToken();
            const response = await fetch(`http://localhost:4000/api/movies/${id}/reviews`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error("Failed to load reviews");
            }
            
            const data = await response.json();
            
            if (!Array.isArray(data)) {
                throw new Error("Invalid reviews response");
            }
            
            // Pagination côté client
            const startIndex = pageToLoad * PAGE_SIZE;
            const paginatedData = data.slice(startIndex, startIndex + PAGE_SIZE);
            
            setReviews((prev) => [...prev, ...paginatedData]);
            
            if (paginatedData.length < PAGE_SIZE || startIndex + PAGE_SIZE >= data.length) {
                setHasMore(false);
            }
            
            setPage(pageToLoad);
        } catch (err) {
            console.error('Error loading reviews:', err);
            setError(err.message || "Error loading reviews");
        } finally {
            setLoadingReviews(false);
        }
    }

    function loadMore() {
        loadReviews(page + 1);
    }

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

    if (loadingMovie) return <div style={{ textAlign: 'center', padding: '20px' }}>Loading movie...</div>;
    if (error && !movie) return <div style={{ color: 'red', textAlign: 'center', padding: '20px' }}>Error: {error}</div>;
    if (!movie) return <div style={{ textAlign: 'center', padding: '20px' }}>No movie found</div>;

    return (
        <div style={{ maxWidth: 980, margin: "24px auto", padding: 16 }}>
            <div style={{ display: "flex", gap: 20, flexWrap: 'wrap' }}>
                <img
                    src={movie.poster || "/placeholder-poster.png"}
                    alt={movie.title}
                    style={{ width: 260, height: 'auto', borderRadius: 6, objectFit: "cover" }}
                />
                <div style={{ flex: 1, minWidth: 300 }}>
                    <h1 style={{ margin: "0 0 8px 0" }}>{movie.title}</h1>
                    <div style={{ color: "#666", marginBottom: 8 }}>
                        {movie.genre && <span style={{ marginRight: 12 }}>Genre: {movie.genre}</span>}
                        {movie.duration && <span>Duration: {movie.duration} min</span>}
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <strong>Average rating:</strong>{" "}
                        <span style={{ background: "#ffeb3b", padding: "2px 8px", borderRadius: 4 }}>
                            {averageRating()}
                        </span>
                    </div>
                    
                    {/* Bouton pour ajouter un avis */}
                    <div style={{ marginBottom: 16 }}>
                        <button 
                            onClick={handleAddReview}
                            style={{
                                padding: "10px 20px",
                                backgroundColor: "#5e35b1",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer"
                            }}
                        >
                            ✍️ Add Review
                        </button>
                    </div>

                    <div>
                        <h3 style={{ marginBottom: 6 }}>Description</h3>
                        <p style={{ marginTop: 0, lineHeight: 1.6 }}>{movie.description}</p>
                    </div>
                </div>
            </div>

            <section style={{ marginTop: 28 }}>
                <h2 style={{ marginBottom: 16 }}>Reviews ({reviews.length})</h2>
                
                {reviews.length === 0 && !loadingReviews && (
                    <div style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
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
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, alignItems: 'center' }}>
                                <div style={{ fontWeight: 600, fontSize: '1.1em' }}>
                                    {r.author || "Anonymous"}
                                </div>
                                <div style={{ 
                                    color: "#444", 
                                    fontWeight: 'bold',
                                    background: '#f0f0f0',
                                    padding: '4px 8px',
                                    borderRadius: '4px'
                                }}>
                                    ⭐ {r.rating}/5
                                </div>
                            </div>
                            <div style={{ color: "#333", lineHeight: 1.5, marginBottom: 8 }}>
                                {r.comment}
                            </div>
                            <div style={{ color: "#999", fontSize: '0.9em' }}>
                                {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ marginTop: 20, textAlign: 'center' }}>
                    {hasMore ? (
                        <button
                            onClick={loadMore}
                            disabled={loadingReviews}
                            style={{
                                padding: "10px 20px",
                                borderRadius: 6,
                                border: "1px solid #ccc",
                                background: "#fff",
                                cursor: loadingReviews ? "not-allowed" : "pointer",
                                opacity: loadingReviews ? 0.6 : 1
                            }}
                        >
                            {loadingReviews ? "Loading..." : "Load more reviews"}
                        </button>
                    ) : (
                        reviews.length > 0 && (
                            <div style={{ color: "#666", fontStyle: 'italic' }}>
                                All reviews loaded.
                            </div>
                        )
                    )}
                </div>

                {error && (
                    <div style={{ marginTop: 12, color: "crimson", textAlign: 'center' }}>
                        Error: {error}
                    </div>
                )}
            </section>
        </div>
    );
}