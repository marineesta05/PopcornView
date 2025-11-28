import { useState } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";

const AddReview = () => {
    const navigate = useNavigate();
    const { movieId } = useParams(); // Récupérer l'ID du film depuis l'URL
    const token = localStorage.getItem("token");

    const [formData, setFormData] = useState({
        rating: "",
        comment: "",
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

        // Validation de la note
        if (formData.rating < 1 || formData.rating > 5) {
            setError("La note doit être entre 1 et 5");
            return;
        }

        try {
            const response = await axios.post(
                "http://localhost:3003/reviews", 
                {
                    movie_id: movieId,
                    rating: parseInt(formData.rating),
                    comment: formData.comment
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );
            
            if (response.status === 201) {
                setSuccess("Avis ajouté avec succès!");
                setTimeout(() => {
                    navigate(`/movie/${movieId}`); // Rediriger vers la page du film
                }, 1500);
            }
        } catch (err) {
            setError(err.response?.data?.message || "Une erreur est survenue. Veuillez réessayer.");
        }
    };

    return (
        <div className="add-review">
            <h2>Ajouter un avis</h2>
            {error && <p style={{ color: "red" }}>{error}</p>}
            {success && <p style={{ color: "green" }}>{success}</p>}
            
            <form onSubmit={handleSubmit}>
                <div>
                    <label htmlFor="rating">Note (1-5) :</label>
                    <input
                        type="number"
                        id="rating"
                        name="rating"
                        min="1"
                        max="5"
                        value={formData.rating}
                        onChange={handleChange}
                        required
                    />
                </div>

                <div>
                    <label htmlFor="comment">Commentaire :</label>
                    <textarea
                        id="comment"
                        name="comment"
                        rows="5"
                        value={formData.comment}
                        onChange={handleChange}
                        required
                        placeholder="Partagez votre avis sur ce film..."
                    />
                </div>

                <button type="submit">Publier l'avis</button>
                <button type="button" onClick={() => navigate(`/movie/${movieId}`)}>
                    Annuler
                </button>
            </form>
        </div>
    );
};

export default AddReview;