import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const FILMS_API = 'http://localhost:4000/api';

const Login = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        setMessage('');

        try {
            console.log('Tentative de connexion...'); // Debug
            
            const response = await fetch(`${FILMS_API}/auth/login`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (response.ok) {
                // token is stored in HttpOnly cookie by the server; verify session then navigate
                setMessage('Connexion réussie!');
                try {
                    const me = await axios.get(`${FILMS_API}/auth/me`, { withCredentials: true, timeout: 5000 });
                    if (me && me.data && me.data.user) {
                        setTimeout(() => navigate('/home'), 300);
                    } else {
                        setMessage('Connexion établie mais impossible de récupérer la session');
                    }
                } catch (e) {
                    console.error('Failed to verify session after login', e);
                    setMessage('Connexion réussie mais vérification de session échouée');
                }
            } else {
                setMessage(data.message || 'Échec de la connexion');
            }
        } catch (error) {
            console.error('Erreur:', error); // Debug
            setMessage('Erreur de connexion au serveur. Vérifiez que le serveur est démarré.');
        } 
    };

    return (
        <div className="login-container">
            <h1>Login</h1>
            <form onSubmit={handleSubmit}>
                <div>
                    <label>Email:</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <div>
                    <label>Password:</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                <button type="submit">Login</button>
            </form>
            {message && <p>{message}</p>}
        </div>
    );
};

export default Login;