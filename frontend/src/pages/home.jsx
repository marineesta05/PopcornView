import { useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { jwtDecode } from "jwt-decode";
//import socket from "../socket"; 

const Home = () => {
    const navigate = useNavigate();
    const [movies, setMovies] = useState([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const token = localStorage.getItem("token");
    //const socketInitialized = useRef(false);
    
    useEffect(() => {
        if (token) {
            try {
                const decoded = jwtDecode(token);
                setIsAdmin(decoded.role === 'admin');
            } catch (error) {
                console.error("Failed to decode token:", error.message);
            }
        }
    }, [token]);
    
    useEffect(() => {
        fetchMovies();
    }, []);
    
    

    const fetchMovies = async () => {
        try {
            const response = await axios.get("http://localhost:3001/movies");
            setMovies(response.data);
        } catch (error) {
            console.error("Error fetching Movies:", error);
        }
    };

    const addReview = (movieId) => {
        navigate(`/reviewMovie/${movieId}`);
    };


    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1>All Movies</h1>
                
            </div>

            

            <ul style={{ 
                listStyle: 'none', 
                padding: 0,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '20px'
            }}>
                {movies.length > 0 ? (
                    movies.map(movie => (
                        <li key={movie.id} style={{
                            border: '1px solid #ddd',
                            borderRadius: '8px',
                            padding: '16px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}>
                            <img src={movie.image} alt={movie.title} style={{ 
                                width: "100%", 
                                height: "200px", 
                                objectFit: "cover",
                                borderRadius: "6px"
                            }} />
                            <h2>{movie.title}</h2>
                            <p>Duree: {movie.duree}</p>
                            <p>Note: {movie.note}</p>
                            <p>Genre: {movie.genre}</p>
                            
                            <button 
                                onClick={() => navigate('/reviewMovie')}
                                style={{
                                    backgroundColor: "#5e35b1",
                                    color: "white",
                                    padding: "8px 16px",
                                    border: "none",
                                    borderRadius: "4px",
                                    marginBottom: "20px",
                                    cursor: "pointer"
                                }}
                            >
                                Ajouter une critique
                            </button>
                        </li>
                    ))
                ) : (
                    <p style={{ textAlign: 'center', gridColumn: '1 / -1' }}>
                        Aucun événement disponible
                    </p>
                )}
            </ul>
        </div>
    );
};
            
export default Home;