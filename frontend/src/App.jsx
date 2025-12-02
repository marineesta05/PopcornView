import logo from './logo.svg';
import './App.css';
import Register from './pages/auth/register';
import Login from './pages/auth/login';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Home from './pages/home';
import AdminUsers from './AdminUsers';
import AdminMovies from './AdminMovies';
import AddReview from './pages/movieReview';
import MovieDetail from './pages/movieDetail';
import Legal from './pages/legal';
import Profile from './pages/profile';

function App() {
  return (
    <div className="App">
       <BrowserRouter>
        <Routes>
          <Route path="/" element={<Register />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/home" element={<Home />} />
          <Route path="/admin" element={<AdminMovies />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/movie/:movieId/review" element={<AddReview />} />
          <Route path="/movie/:id" element={<MovieDetail />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/legal" element={<Legal />} />
        </Routes>
        <div style={{ marginTop: 24 }}>
          <footer style={{ display: 'flex', justifyContent: 'center', padding: 12, borderTop: '1px solid #eee' }}>
            <Link to="/legal" style={{ textDecoration: 'none' }}>
              <button style={{ background: '#131a20', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 6, cursor: 'pointer' }}>📄 Mentions légales</button>
            </Link>
          </footer>
        </div>
    </BrowserRouter>
    </div>
  );
}

export default App;
