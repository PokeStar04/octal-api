const { supabase, pool } = require('./db'); // Importer les connexions

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







// Fonction pour récupérer le coût moyen à partir du type de chauffage
 async function recupererCoutMoyen(chauffage) {
    try {
        // Récupération du coût moyen pour le type de chauffage donné
        const { data, error } = await supabase
            .from('energyCost')
            .select('cout_moyen_kwh') // On sélectionne uniquement la colonne coût
            .eq('type_chauffage', chauffage); // On filtre par type de chauffage

        if (error) {
            console.error('Erreur lors de la récupération du coût moyen:', error.message);
            throw new Error('Erreur lors de la récupération du coût moyen.');
        }

        if (data.length === 0) {
            console.warn('Type de chauffage non trouvé.');
            throw new Error('Type de chauffage non trouvé.');
        }

        // Retourne la valeur récupérée
        console.log(data[0])

        console.log(data[0].cout_moyen_kwh)
        return data[0].cout_moyen_kwh;
    } catch (err) {
        console.error('Erreur attrapée dans la fonction:', err.message);
        throw err; // Relance l'erreur pour être gérée par l'appelant
    }
}





 async function recupererConsoDPE(classeDpe = 'B') { // Par défaut, utilise "DPE"
    try {
        // Récupération des consommations pour la classe DPE donnée
        const { data, error } = await supabase
            .from('dpeCoutAnnuel_kwh_m2_an') // Nom de la table
            .select('consommation_min, consommation_moyenne, consommation_max') // Colonnes à récupérer
            .eq('classe_dpe', classeDpe); // Filtre par classe DPE

        if (error) {
            console.error('Erreur lors de la récupération des consommations:', error.message);
            throw new Error('Erreur lors de la récupération des consommations.');
        }

        if (data.length === 0) {
            console.warn('Classe DPE non trouvée.');
            throw new Error('Classe DPE non trouvée.');
        }

        // Retourne les consommations récupérées
        return {
            consommation_min: data[0].consommation_min,
            consommation_moyenne: data[0].consommation_moyenne,
            consommation_max: data[0].consommation_max,
        };
    } catch (err) {
        console.error('Erreur attrapée dans la fonction:', err.message);
        throw err; // Relance l'erreur pour être gérée par l'appelant
    }
}


module.exports = { calculateIPE, recupererCoutMoyen , recupererConsoDPE };

