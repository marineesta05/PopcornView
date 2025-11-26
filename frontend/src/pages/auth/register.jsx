import { useState } from "react";
import { useNavigate } from "react-router-dom";

const Register = () => {
    const navigate = useNavigate();  

    const [formData, setFormData] = useState({
        nom: "",
        prenom: "",
        email: "",
        password: "",
        role: "user"
    });

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        try {
            const response = await fetch("http://localhost:3001/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.status === 201) {
                setSuccess("Registration successful!");
                navigate("/login");  
                setFormData({ email: "", password: "" });
            } else {
                setError(data.message || "Une erreur s'est produite.");
            }
        } catch (err) {
            setError("Une erreur s'est produite. Veuillez réessayer.");
        }
    };

    return (
        <div style={{ maxWidth: "400px", margin: "50px auto", padding: "20px", fontFamily: "Arial, sans-serif" }}>
            <h2 style={{ textAlign: "center", marginBottom: "20px" }}>Inscription</h2>

            {error && (
                <p style={{ color: "red", marginBottom: "10px", padding: "10px", backgroundColor: "#ffebee", borderRadius: "4px" }}>
                    {error}
                </p>
            )}

            {success && (
                <p style={{ color: "green", marginBottom: "10px", padding: "10px", backgroundColor: "#e8f5e9", borderRadius: "4px" }}>
                    {success}
                </p>
            )}

            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: "15px" }}>
                    <label htmlFor="nom" style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Nom :</label>
                    <input
                        type="text"
                        id="nom"
                        name="nom"
                        value={formData.nom}
                        onChange={handleChange}
                        maxLength={20}
                        style={{ width: "100%", padding: "8px" }}
                        required
                    />
                </div>

                <div style={{ marginBottom: "15px" }}>
                    <label htmlFor="prenom" style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Prénom :</label>
                    <input
                        type="text"
                        id="prenom"
                        name="prenom"
                        value={formData.prenom}
                        onChange={handleChange}
                        maxLength={20}
                        style={{ width: "100%", padding: "8px" }}
                        required
                    />
                </div>

                <div style={{ marginBottom: "15px" }}>
                    <label htmlFor="email" style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Email :</label>
                    <input
                        type="email"
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        maxLength={50}
                        style={{ width: "100%", padding: "8px" }}
                        required
                    />
                </div>

                <div style={{ marginBottom: "15px" }}>
                    <label htmlFor="password" style={{ display: "block", marginBottom: "5px", fontWeight: "bold" }}>Mot de passe :</label>
                    <input
                        type="password"
                        id="password"
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        style={{ width: "100%", padding: "8px" }}
                        required
                    />
                    <small style={{ color: "#666", fontSize: "12px" }}>
                        Min. 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère spécial (@$!%*?&)
                    </small>
                </div>

                <button 
                    type="submit"
                    style={{
                        width: "100%",
                        padding: "10px",
                        marginBottom: "10px",
                        backgroundColor: "#131a20",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "16px",
                        fontWeight: "bold"
                    }}
                >
                    S'inscrire
                </button>
            </form>

            {/* BOUTONS DE NAVIGATION */}
            <button
                onClick={() => navigate("/login")}
                style={{
                    width: "100%",
                    padding: "10px",
                    marginBottom: "10px",
                    backgroundColor: "#303d48",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer"
                }}
            >
                J'ai déjà un compte
            </button>

            <button
                onClick={() => navigate("/home")}
                style={{
                    width: "100%",
                    padding: "10px",
                    marginBottom: "10px",
                    backgroundColor: "#325139",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer"
                }}
            >
                Continuer sans compte
            </button>

            <button
                onClick={() => navigate("/admin/login")}
                style={{
                    width: "100%",
                    padding: "10px",
                    backgroundColor: "#521a20",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer"
                }}
            >
                Je suis un administrateur
            </button>
        </div>
    );
};

export default Register;
