import logo from './logo.svg';
import './App.css';
import Register from './pages/auth/register';
import Login from './pages/auth/login';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/home';
import AdminUsers from './AdminUsers';
import AdminMovies from './AdminMovies';
import AddReview from './pages/movieReview';
import MovieDetail from './pages/movieDetail';

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
        </Routes>
    </BrowserRouter>
    </div>
  );
}

export default App;
