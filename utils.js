 function getDpeScore(dpeClass) {
    const dpeScores = {
        A: 1,
        B: 1.5,
        C: 2,
        D: 2.5,
        E: 3,
        F: 3.5,
        G: 4,
    };
    return dpeScores[dpeClass] || null; // Retourne null si le DPE est invalide
}

 async function calculateIPE(selectedDpeData) {
    try {
        // Étape 1: Récupérer le DPE score
        const dpeClass = selectedDpeData?.etiquette_DPE || null;
        if (!dpeClass) {
            throw new Error('Classe DPE manquante pour calculer le score.');
        }

        const dpeScore = getDpeScore(dpeClass);
        if (!dpeScore) {
            throw new Error(`Classe DPE invalide : ${dpeClass}`);
        }

        // Étape 2: Récupérer les données nécessaires
        const consoChauffage = parseFloat(selectedDpeData?.conso_chauffage || 0); // Consommation de chauffage finale
        const conso5UsagesM2 = parseFloat(selectedDpeData?.conso_5_usages_par_m2 || 0); // Consommation énergétique par m²

        if (consoChauffage === 0 || conso5UsagesM2 === 0) {
            throw new Error('Consommation de chauffage ou par m² manquante.');
        }

        // Étape 3: Calculer l'IPE
        let IPE = dpeScore * consoChauffage * conso5UsagesM2;

         // Diviser pour simplifier l'interprétation
         IPE = IPE / 1000; // Convertir en milliers pour une meilleure lisibil

        console.log(`IPE calculé : ${IPE} pour la classe DPE ${dpeClass}`);
        return IPE;
    } catch (error) {
        console.error('Erreur lors du calcul de l\'IPE :', error.message);
        return null; // Retourne null en cas d'erreur
    }
}

module.exports = { getDpeScore, calculateIPE };
