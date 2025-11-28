import logo from './logo.svg';
import './App.css';
import Register from './pages/auth/register';
import Login from './pages/auth/login';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/home';

function App() {
  return (
    <div className="App">
       <BrowserRouter>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/home" element={<Home />} />
        </Routes>
    </BrowserRouter>
    </div>
  );
}

export default App;
