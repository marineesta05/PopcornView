import './App.css';
import AdminMovies from './AdminMovies';
import Login from './pages/auth/login';
import Register from './pages/auth/register';

function App() {
  const path = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '/';

  if (path.startsWith('/register')) return <Register />;
  if (path.startsWith('/admin')) return <AdminMovies />;
  return <Login />;
}

export default App;
