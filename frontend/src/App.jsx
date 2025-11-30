import logo from './logo.svg';
import './App.css';
import Register from './pages/auth/register';
import Login from './pages/auth/login';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/home';
import AdminUsers from './AdminUsers';
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
          <Route path="/admin" element={<AdminUsers />} />
          <Route path="/movie/:movieId/review" element={<AddReview />} />
          <Route path="/movie/:movieId" element={<MovieDetail />} />
        </Routes>
    </BrowserRouter>
    </div>
  );
}

export default App;
