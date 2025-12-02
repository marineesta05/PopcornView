import React from 'react';
import { Link } from 'react-router-dom';
import './legal.css';

export default function Legal() {
  return (
    <div className="legal-page">
      <div className="legal-header">
        <h1 className="legal-title">Mentions légales</h1>
        <Link to="/home">
          <button className="btn-back" aria-label="Retour à l'accueil">← Retour</button>
        </Link>
      </div>

      <div className="legal-card" role="main">
        <section className="legal-section">
          <h2>Qui gère le site</h2>
          <p>Ce site est géré par <strong>Jessica Jaunaux et Marine El Osta</strong>. adresse : 10 rue de la République, Villejuif, 94800. 
          <br/> contact : popcornview@gmail.com,
          <br/> SIRET : 362 521 879 00034 </p>
        </section>

        <section className="legal-section">
          <h2>Quelles données</h2>
          <p>Nous collectons et traitons les données personnelles suivantes :</p>
          <ul>
            <li>Email</li>
            <li>Nom</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>Pourquoi</h2>
          <p>Ces données sont utilisées pour l'authentification des comptes et la gestion des inscriptions (connexion, réinitialisation de mot de passe, notifications liées au compte).</p>
        </section>

        <section className="legal-section">
          <h2>Durée de conservation</h2>
          <p>Les données d'authentification sont conservées tant que votre compte est actif. Si vous supprimez votre compte, vos données seront supprimées ou rendues anonymes conformément à la réglementation en vigueur.</p>
        </section>

        <section className="legal-section">
          <h2>Droits utilisateur</h2>
          <p>Vous disposez des droits suivants concernant vos données personnelles :</p>
          <ul>
            <li>Accès : demander une copie des données que nous détenons.</li>
            <li>Rectification : corriger des informations inexactes.</li>
            <li>Suppression : demander la suppression de vos données.</li>
            <li>Opposition : vous opposer à certains traitements.</li>
            <li>Portabilité : obtenir vos données dans un format structuré, couramment utilisé et lisible par machine.</li>
          </ul>
          <p>Pour exercer ces droits, contactez-nous à <strong>popcornview@gmail.com</strong>.</p>
        </section>
      </div>
    </div>
  );
}
