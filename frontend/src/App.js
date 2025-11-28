import './App.css';
import AdminMovies from './AdminMovies';
<<<<<<< HEAD
<<<<<<< HEAD

function App() {
  return (
    <div className="App">
      <main>
        <AdminMovies />
      </main>
    </div>
  );
=======
=======
>>>>>>> ccf6da3f05f55445764b658e3ed484f205434861
import Login from './pages/auth/login';
import Register from './pages/auth/register';

function App() {
  const path = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '/';

  if (path.startsWith('/register')) return <Register />;
  if (path.startsWith('/admin')) return <AdminMovies />;
  return <Login />;
<<<<<<< HEAD
>>>>>>> 173e75054d07f4e0c129abc68f5740577f23e7d0
=======
>>>>>>> ccf6da3f05f55445764b658e3ed484f205434861
}

export default App;