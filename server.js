require('dotenv').config(); // Charger les variables d'environnement
const { supabase, pool } = require('./db'); // Importer les connexions
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3001;
const {  calculateIPE, recupererCoutMoyen, recupererConsoDPE} = require ('./utils.js');

// Middleware pour parser le JSON
app.use(express.json());



// Endpoint : Récupérer tous les utilisateurs depuis Supabase
app.get('/users', async (req, res) => {
    try {
        const { data, error } = await supabase.from('usersTB').select('*');
        if (error) {
            console.error('Erreur Supabase :', error.message);
            return res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs.' });
        }
        res.status(200).json({ users: data });
    } catch (error) {
        console.error('Erreur inattendue Supabase :', error.message);
        res.status(500).json({ error: 'Erreur inattendue lors de la récupération des utilisateurs.' });
    }
});


// Endpoint : Récupérer tous les utilisateurs depuis PostgreSQL
app.get('/postgres-users', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM usersTB');
        res.status(200).json({ users: result.rows });
    } catch (error) {
        console.error('Erreur PostgreSQL :', error.message);
        res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs depuis PostgreSQL.' });
    }
});


// Endpoint combiné pour récupérer les données géocodées, DVF, et DPE
app.post('/combined-data', async (req, res) => {
    const { numero, type_voie, adresse, code_postal, commune, distance } = req.body;

    // Validation des paramètres
    if (!numero || !type_voie || !adresse || !code_postal || !commune) {
        return res.status(400).json({
            error: 'Missing parameters. Required: numero, type_voie, adresse, code_postal, commune',
        });
    }

    try {
        // 1. Appel au service de géocodage pour obtenir les coordonnées
        const formattedAddress = `${numero} ${type_voie} ${adresse} ${code_postal} ${commune}`;
        const encodedAddress = encodeURIComponent(formattedAddress);
        const geocodeUrl = `https://api-adresse.data.gouv.fr/search/?q=${encodedAddress}`;

        console.log(`Fetching geocode data for address: ${formattedAddress}`);
        const geocodeResponse = await axios.get(geocodeUrl);

        if (
            !geocodeResponse.data ||
            !geocodeResponse.data.features ||
            geocodeResponse.data.features.length === 0
        ) {
            return res.status(404).json({
                error: 'No coordinates found for the given address',
            });
        }

        // Extraire la première paire de coordonnées
        const firstFeature = geocodeResponse.data.features[0];
        const latitude = firstFeature.geometry.coordinates[1];
        const longitude = firstFeature.geometry.coordinates[0];

        // 2. Appel à l'API DVF pour récupérer les mutations foncières
        const dist = distance || 100; // Distance par défaut de 100 mètres
        const dvfUrl = `https://api.cquest.org/dvf?lat=${latitude}&lon=${longitude}&dist=${dist}`;

        console.log(`Fetching DVF data for coordinates: ${latitude}, ${longitude}`);
        const dvfResponse = await axios.get(dvfUrl);

        if (
            !dvfResponse.data ||
            !dvfResponse.data.features ||
            dvfResponse.data.features.length === 0
        ) {
            return res.status(404).json({
                error: 'No mutation data found for the given coordinates',
            });
        }

        // Extraire les données des mutations et trouver la mutation la plus récente
        const mutationData = dvfResponse.data.features.map((feature) => {
            const { date_mutation, lat, lon } = feature.properties;
            return {
                date_mutation,
                latitude: lat,
                longitude: lon,
            };
        });

        // Récupérer la mutation la plus récente (tri par date décroissante)
        const recentMutation = mutationData.sort(
            (a, b) => new Date(b.date_mutation) - new Date(a.date_mutation)
        )[0];

        // 3. Appel à l'API ADEME pour récupérer les données DPE
        const geoDistanceParam = encodeURIComponent(`${longitude}:${latitude}:${dist}`);
        const ademeUrl = `https://data.ademe.fr/data-fair/api/v1/datasets/dpe-v2-logements-existants/lines?geo_distance=${geoDistanceParam}`;

        console.log(`Fetching DPE data for coordinates: ${longitude}, ${latitude}`);
        const ademeResponse = await axios.get(ademeUrl);

        if (
            !ademeResponse.data ||
            !ademeResponse.data.results ||
            ademeResponse.data.results.length === 0
        ) {
            return res.status(404).json({
                error: 'No DPE data found for the given coordinates',
            });
        }

        // Extraire les données pertinentes des DPE
        let dpeData = ademeResponse.data.results.map((result) => {
            const {
                "Nom__commune_(BAN)": commune,
                "Code_postal_(BAN)": codePostal,
                "N°_voie_(BAN)": numeroVoie,
                "Identifiant__BAN": identifiantBan,
                "Adresse_(BAN)": adresseComplete,
                "Annee_construction": anneeConstruction,
                "Type_bâtiment": typeBatiment,
                "Type_installation_chauffage": typeInstallationChauffage,
                "Période_construction": periodeConstruction,
                "Etiquette_DPE": etiquetteDpe,
                "Hauteur_sous-plafond": hauteurSousPlafond,
                "Surface_habitable_logement": surfaceHabitableLogement,
                "Surface_habitable_immeuble": surfaceHabitableImmeuble,
                "Type_installation_ECS_(général)": typeInstallationECS,
                "Nombre_appartement": nombreAppartement,
                "Adresse_brute": adresseBrute,
                "Coordonnée_cartographique_X_(BAN)": coordX,
                "Coordonnée_cartographique_Y_(BAN)": coordY,
                "Conso_5_usages_é_finale": conso5Usages,
                "Conso_5_usages/m²_é_finale": conso5UsagesParM2,
                "Conso_chauffage_é_finale": consoChauffage,
                "Conso_chauffage_dépensier_é_finale": consoChauffageDepensier,
                "Conso_éclairage_é_finale": consoEclairage,
                "Conso_ECS_é_finale": consoECS,
                "Conso_auxiliaires_é_finale": consoAuxiliaires,
                "Conso_refroidissement_é_finale": consoRefroidissement
            } = result;

            return {
                commune,
                code_postal: codePostal,
                numero_voie: numeroVoie,
                identifiant_ban: identifiantBan,
                adresse_complete: adresseComplete,
                annee_construction: anneeConstruction,
                type_batiment: typeBatiment,
                type_installation_chauffage: typeInstallationChauffage,
                periode_construction: periodeConstruction,
                etiquette_DPE: etiquetteDpe,
                hauteur_sous_plafond: hauteurSousPlafond,
                surface_habitable_logement: surfaceHabitableLogement,
                surface_habitable_immeuble: surfaceHabitableImmeuble,
                nombreAppartement: nombreAppartement,
                typeInstallationECS: typeInstallationECS,
                adresse_brute: adresseBrute,
                coordX,
                coordY,
                conso_5_usages: conso5Usages,
                conso_5_usages_par_m2: conso5UsagesParM2,
                conso_chauffage: consoChauffage,
                conso_chauffage_depensier: consoChauffageDepensier,
                conso_eclairage: consoEclairage,
                conso_ecs: consoECS,
                conso_auxiliaires: consoAuxiliaires,
                conso_refroidissement: consoRefroidissement,
            };
        });

        // Filtrer les données DPE pour ne conserver que celles avec le numéro de voie correspondant
        dpeData = dpeData.filter((data) => data.numero_voie === numero);

        // Réponse combinée finale
        res.status(200).json({
            address: formattedAddress,
            geocode: { latitude, longitude },
            recentMutation,
            dpeData,
        });
    } catch (error) {
        console.error('Error fetching combined data:', error.message);
        res.status(500).json({ error: 'Failed to fetch combined data' });
    }
});

// Endpoint pour récupérer les données combinées pour tous les utilisateurs
// Endpoint pour récupérer les données combinées pour tous les utilisateurs
app.get('/users-combined-data', async (req, res) => {
    try {
        // Étape 1: Récupérer les utilisateurs depuis Supabase
        const { data: users, error } = await supabase.from('usersTB').select('*');
        if (error) {
            console.error('Erreur lors de la récupération des utilisateurs:', error.message);
            return res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs.' });
        }

        // Étape 2: Parcourir chaque utilisateur et générer les données combinées
        const usersCombinedData = await Promise.all(
            users.map(async (user) => {
                try {
                    // Extraction et préparation des paramètres nécessaires
                    const numeroVoie = user["N°_voie(BAN)"];
                    const nomRue = user["Nom_rue_(BAN)"];
                    const codePostal = user["Code_postal_(BAN)"];
                    const commune = user.commune || ""; // Si `commune` est manquant, utiliser une chaîne vide

                    // Vérification des paramètres nécessaires
                    if (!numeroVoie || !nomRue || !codePostal) {
                        console.warn(`Données incomplètes pour l'utilisateur ${user.nom} ${user.prenom}`);
                        return { ...user, combinedData: null, error: 'Données incomplètes pour cet utilisateur.' };
                    }

                    // Préparer les paramètres pour appeler les APIs
                    const typeVoie = nomRue.split(' ')[0]; // Supposer que le premier mot est le type de voie
                    const adresse = nomRue.replace(/^\S+\s/, ''); // Supposer que le reste est le nom de la rue
                    const formattedAddress = `${numeroVoie} ${typeVoie} ${adresse} ${codePostal} ${commune}`;
                    const encodedAddress = encodeURIComponent(formattedAddress);

                    // Étape 2.1 : Appeler l'API de géocodage
                    const geocodeUrl = `https://api-adresse.data.gouv.fr/search/?q=${encodedAddress}`;
                    const geocodeResponse = await axios.get(geocodeUrl);

                    if (
                        !geocodeResponse.data ||
                        !geocodeResponse.data.features ||
                        geocodeResponse.data.features.length === 0
                    ) {
                        console.warn(`Aucune coordonnée trouvée pour l'utilisateur ${user.nom} ${user.prenom}`);
                        return { ...user, combinedData: null, error: 'Aucune coordonnée trouvée.' };
                    }

                    // Extraire la première paire de coordonnées
                    const firstFeature = geocodeResponse.data.features[0];
                    const latitude = firstFeature.geometry.coordinates[1];
                    const longitude = firstFeature.geometry.coordinates[0];

                    // Étape 2.2 : Appeler l'API DVF
                    const dist = 100; // Distance par défaut
                    const dvfUrl = `https://api.cquest.org/dvf?lat=${latitude}&lon=${longitude}&dist=${dist}`;
                    const dvfResponse = await axios.get(dvfUrl);

                    if (
                        !dvfResponse.data ||
                        !dvfResponse.data.features ||
                        dvfResponse.data.features.length === 0
                    ) {
                        console.warn(`Aucune donnée DVF trouvée pour l'utilisateur ${user.nom} ${user.prenom}`);
                        return { ...user, combinedData: null, error: 'Aucune donnée DVF trouvée.' };
                    }

                    // Extraire les données des mutations et trouver la mutation la plus récente
                    const mutationData = dvfResponse.data.features.map((feature) => {
                        const { date_mutation, lat, lon } = feature.properties;
                        return {
                            date_mutation,
                            latitude: lat,
                            longitude: lon,
                        };
                    });

                    const recentMutation = mutationData.sort(
                        (a, b) => new Date(b.date_mutation) - new Date(a.date_mutation)
                    )[0];

                    // Étape 2.3 : Appeler l'API ADEME
                    const geoDistanceParam = encodeURIComponent(`${longitude}:${latitude}:${dist}`);
                    const ademeUrl = `https://data.ademe.fr/data-fair/api/v1/datasets/dpe-v2-logements-existants/lines?geo_distance=${geoDistanceParam}`;
                    const ademeResponse = await axios.get(ademeUrl);

                    if (
                        !ademeResponse.data ||
                        !ademeResponse.data.results ||
                        ademeResponse.data.results.length === 0
                    ) {
                        console.warn(`Aucune donnée DPE trouvée pour l'utilisateur ${user.nom} ${user.prenom}`);
                        return { ...user, combinedData: null, error: 'Aucune donnée DPE trouvée.' };
                    }

                    const dpeData = ademeResponse.data.results.map((result) => {
                        const {
                            "Nom__commune_(BAN)": commune,
                            "Code_postal_(BAN)": codePostal,
                            "N°_voie_(BAN)": numeroVoie,
                            "Identifiant__BAN": identifiantBan,
                            "Adresse_(BAN)": adresseComplete,
                            "Annee_construction": anneeConstruction,
                            "Type_bâtiment": typeBatiment,
                            "Type_installation_chauffage": typeInstallationChauffage,
                            "Période_construction": periodeConstruction,
                            "Etiquette_DPE": etiquetteDpe,
                            "Hauteur_sous-plafond": hauteurSousPlafond,
                            "Surface_habitable_logement": surfaceHabitableLogement,
                            "Surface_habitable_immeuble": surfaceHabitableImmeuble,
                            "Type_installation_ECS_(général)": typeInstallationECS,
                            "Nombre_appartement": nombreAppartement,
                            "Adresse_brute": adresseBrute,
                            "Coordonnée_cartographique_X_(BAN)": coordX,
                            "Coordonnée_cartographique_Y_(BAN)": coordY,
                            "Conso_5_usages_é_finale": conso5Usages,
                            "Conso_5_usages/m²_é_finale": conso5UsagesParM2,
                            "Conso_chauffage_é_finale": consoChauffage,
                            "Conso_chauffage_dépensier_é_finale": consoChauffageDepensier,
                            "Conso_éclairage_é_finale": consoEclairage,
                            "Conso_ECS_é_finale": consoECS,
                            "Conso_auxiliaires_é_finale": consoAuxiliaires,
                            "Conso_refroidissement_é_finale": consoRefroidissement
                        } = result;

                        return {
                            commune,
                            code_postal: codePostal,
                            numero_voie: numeroVoie,
                            identifiant_ban: identifiantBan,
                            adresse_complete: adresseComplete,
                            annee_construction: anneeConstruction,
                            type_batiment: typeBatiment,
                            type_installation_chauffage: typeInstallationChauffage,
                            periode_construction: periodeConstruction,
                            etiquette_DPE: etiquetteDpe,
                            hauteur_sous_plafond: hauteurSousPlafond,
                            surface_habitable_logement: surfaceHabitableLogement,
                            surface_habitable_immeuble: surfaceHabitableImmeuble,
                            nombreAppartement: nombreAppartement,
                            typeInstallationECS: typeInstallationECS,
                            adresse_brute: adresseBrute,
                            coordX,
                            coordY,
                            conso_5_usages: conso5Usages,
                            conso_5_usages_par_m2: conso5UsagesParM2,
                            conso_chauffage: consoChauffage,
                            conso_chauffage_depensier: consoChauffageDepensier,
                            conso_eclairage: consoEclairage,
                            conso_ecs: consoECS,
                            conso_auxiliaires: consoAuxiliaires,
                            conso_refroidissement: consoRefroidissement,
                        };
                    });
            

                    // A dinamiser
                    // Filtrer les données DPE pour ne conserver que celles avec le numéro de voie correspondant
// Filtrer les données DPE pour ne conserver que celles avec le numéro de voie correspondant
                    const filteredDpeData = dpeData.filter((data) => data.numero_voie === numeroVoie);

                    // Si des entrées existent, sélectionner uniquement la première
                    const selectedDpeData = filteredDpeData.length > 0 ? filteredDpeData[0] : null;                    // Retourner l'utilisateur avec ses données combinées
                    return {
                        ...user,
                        combinedData: {
                            address: formattedAddress,
                            geocode: { latitude, longitude },
                            recentMutation,
                            dpeData: selectedDpeData,
                        },
                    };
                } catch (error) {
                    console.error(`Erreur pour l'utilisateur ${user.nom} ${user.prenom}:`, error.message);

                    // En cas d'erreur, retourner l'utilisateur avec l'erreur
                    return { ...user, combinedData: null, error: error.message };
                }
            })
        );

        // Étape 3: Retourner les utilisateurs enrichis
        res.status(200).json({ users: usersCombinedData });
    } catch (error) {
        console.error('Erreur inattendue:', error.message);
        res.status(500).json({ error: 'Erreur inattendue lors de la récupération des données combinées pour les utilisateurs.' });
    }
});


app.get('/create_users-combined-data-in-db', async (req, res) => {
    try {
        // Étape 1: Récupérer les utilisateurs depuis Supabase
        const { data: users, error } = await supabase.from('usersTB').select('*');
        if (error) {
            console.error('Erreur lors de la récupération des utilisateurs:', error.message);
            return res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs.' });
        }

        // Étape 2: Parcourir chaque utilisateur et générer les données combinées
        const usersCombinedData = await Promise.all(
            users.map(async (user) => {
                try {
                    // Extraction et préparation des paramètres nécessaires
                    const numeroVoie = user["N°_voie(BAN)"];
                    const nomRue = user["Nom_rue_(BAN)"];
                    const codePostal = user["Code_postal_(BAN)"];
                    const commune = user.commune || ""; // Si `commune` est manquant, utiliser une chaîne vide

                    // Vérification des paramètres nécessaires
                    if (!numeroVoie || !nomRue || !codePostal) {
                        console.warn(`Données incomplètes pour l'utilisateur ${user.nom} ${user.prenom}`);
                        return { ...user, combinedData: null, error: 'Données incomplètes pour cet utilisateur.' };
                    }

                    // Préparer les paramètres pour appeler les APIs
                    const typeVoie = nomRue.split(' ')[0]; // Supposer que le premier mot est le type de voie
                    const adresse = nomRue.replace(/^\S+\s/, ''); // Supposer que le reste est le nom de la rue
                    const formattedAddress = `${numeroVoie} ${typeVoie} ${adresse} ${codePostal} ${commune}`;
                    const encodedAddress = encodeURIComponent(formattedAddress);

                    // Étape 2.1 : Appeler l'API de géocodage
                    const geocodeUrl = `https://api-adresse.data.gouv.fr/search/?q=${encodedAddress}`;
                    const geocodeResponse = await axios.get(geocodeUrl);

                    if (
                        !geocodeResponse.data ||
                        !geocodeResponse.data.features ||
                        geocodeResponse.data.features.length === 0
                    ) {
                        console.warn(`Aucune coordonnée trouvée pour l'utilisateur ${user.nom} ${user.prenom}`);
                        return { ...user, combinedData: null, error: 'Aucune coordonnée trouvée.' };
                    }

                    // Extraire la première paire de coordonnées
                    const firstFeature = geocodeResponse.data.features[0];
                    const latitude = firstFeature.geometry.coordinates[1];
                    const longitude = firstFeature.geometry.coordinates[0];

                    // Étape 2.2 : Appeler l'API DVF
                    const dist = 100; // Distance par défaut
                    const dvfUrl = `https://api.cquest.org/dvf?lat=${latitude}&lon=${longitude}&dist=${dist}`;
                    const dvfResponse = await axios.get(dvfUrl);

                    if (
                        !dvfResponse.data ||
                        !dvfResponse.data.features ||
                        dvfResponse.data.features.length === 0
                    ) {
                        console.warn(`Aucune donnée DVF trouvée pour l'utilisateur ${user.nom} ${user.prenom}`);
                        return { ...user, combinedData: null, error: 'Aucune donnée DVF trouvée.' };
                    }

                    // Extraire les données des mutations et trouver la mutation la plus récente
                    const mutationData = dvfResponse.data.features.map((feature) => {
                        const { date_mutation, lat, lon } = feature.properties;
                        return {
                            date_mutation,
                            latitude: lat,
                            longitude: lon,
                        };
                    });

                    const recentMutation = mutationData.sort(
                        (a, b) => new Date(b.date_mutation) - new Date(a.date_mutation)
                    )[0];

                    // Étape 2.3 : Appeler l'API ADEME
                    const geoDistanceParam = encodeURIComponent(`${longitude}:${latitude}:${dist}`);
                    const ademeUrl = `https://data.ademe.fr/data-fair/api/v1/datasets/dpe-v2-logements-existants/lines?geo_distance=${geoDistanceParam}`;
                    const ademeResponse = await axios.get(ademeUrl);

                    if (
                        !ademeResponse.data ||
                        !ademeResponse.data.results ||
                        ademeResponse.data.results.length === 0
                    ) {
                        console.warn(`Aucune donnée DPE trouvée pour l'utilisateur ${user.nom} ${user.prenom}`);
                        return { ...user, combinedData: null, error: 'Aucune donnée DPE trouvée.' };
                    }


                    const { data: users, error } = await supabase.from('usersTB').select('*');
                    if (error) {
                        console.error('Erreur lors de la récupération des utilisateurs:', error.message);
                        return res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs.' });
                    }
                    //ROI = selectedDpeData.conso5UsagesParM2


                    const dpeData = ademeResponse.data.results.map((result) => {
                        const {
                            "Nom__commune_(BAN)": commune,
                            "Code_postal_(BAN)": codePostal,
                            "N°_voie_(BAN)": numeroVoie,
                            "Identifiant__BAN": identifiantBan,
                            "Adresse_(BAN)": adresseComplete,
                            "Annee_construction": anneeConstruction,
                            "Type_bâtiment": typeBatiment,
                            "Type_installation_chauffage": typeInstallationChauffage,
                            "Type_énergie_principale_ECS": typeEnergiePrincipaleECS,
                            "Type_énergie_n°1": chauffage,

                            "Période_construction": periodeConstruction,
                            "Etiquette_DPE": etiquetteDpe,
                            "Hauteur_sous-plafond": hauteurSousPlafond,
                            "Surface_habitable_logement": surfaceHabitableLogement,
                            "Surface_habitable_immeuble": surfaceHabitableImmeuble,
                            "Type_installation_ECS_(général)": typeInstallationECS,
                            "Nombre_appartement": nombreAppartement,
                            "Adresse_brute": adresseBrute,
                            "Coordonnée_cartographique_X_(BAN)": coordX,
                            "Coordonnée_cartographique_Y_(BAN)": coordY,
                            "Conso_5_usages_é_finale": conso5Usages,
                            "Conso_5_usages/m²_é_finale": conso5UsagesParM2,
                            "Conso_chauffage_é_finale": consoChauffage,
                            "Conso_chauffage_dépensier_é_finale": consoChauffageDepensier,
                            "Conso_éclairage_é_finale": consoEclairage,
                            "Conso_ECS_é_finale": consoECS,
                            "Conso_auxiliaires_é_finale": consoAuxiliaires,
                            "Conso_refroidissement_é_finale": consoRefroidissement
                        } = result;

                        return {
                            commune,
                            code_postal: codePostal,
                            numero_voie: numeroVoie,
                            identifiant_ban: identifiantBan,
                            adresse_complete: adresseComplete,
                            annee_construction: anneeConstruction,
                            type_batiment: typeBatiment,
                            type_installation_chauffage: typeInstallationChauffage,
                            periode_construction: periodeConstruction,
                            etiquette_DPE: etiquetteDpe,
                            hauteur_sous_plafond: hauteurSousPlafond,
                            surface_habitable_logement: surfaceHabitableLogement,
                            surface_habitable_immeuble: surfaceHabitableImmeuble,
                            nombreAppartement: nombreAppartement,
                            typeInstallationECS: typeInstallationECS,
                            typeEnergiePrincipaleECS:typeEnergiePrincipaleECS,
                            chauffage: chauffage,
                            adresse_brute: adresseBrute,
                            coordX,
                            coordY,
                            conso_5_usages: conso5Usages,
                            conso_5_usages_par_m2: conso5UsagesParM2,
                            conso_chauffage: consoChauffage,
                            conso_chauffage_depensier: consoChauffageDepensier,
                            conso_eclairage: consoEclairage,
                            conso_ecs: consoECS,
                            conso_auxiliaires: consoAuxiliaires,
                            conso_refroidissement: consoRefroidissement,
                        };
                    });


                    // A dinamiser
                    // Filtrer les données DPE pour ne conserver que celles avec le numéro de voie correspondant
// Filtrer les données DPE pour ne conserver que celles avec le numéro de voie correspondant
                    const filteredDpeData = dpeData.filter((data) => data.numero_voie === numeroVoie);

                    // Si des entrées existent, sélectionner uniquement la première
                    const selectedDpeData = filteredDpeData.length > 0 ? filteredDpeData[0] : null; 

                    // Vérifiez si le type de chauffage est présent
                    const typeChauffage = selectedDpeData?.typeEnergiePrincipaleECS || null;
                    let IRE = null;

                    // Si le type de chauffage est disponible, calculez l'IRE
                    if (typeChauffage) {
                        const { IRE: calculatedIRE } = await calculateIRE(typeChauffage, selectedDpeData);
                        IRE = calculatedIRE; // Assignez la valeur calculée de l'IRE
                    }// Retourner l'utilisateur avec ses données combinées

                

                    // Récupérer le coût énergétique pour le type de chauffage
                    const coutEnergy = await recupererCoutMoyen(selectedDpeData.chauffage);
                    console.log("J'ai coutEnergy ",coutEnergy)
                                        // Récupérer les consommations min, moyenne et max pour la classe DPE
                    // const getDpeConso = await recupererConsoDPE('B'); // 'B' est utilisé comme exemple ici
                    // console.log("J'ai DPE ",getDpeConso)

                    // // Calcul du coût actuel
                    // const consoActuel = selectedDpeData.conso5UsagesParM2 * coutEnergy * selectedDpeData.surface_habitable_logement;
                    // console.log("J'ai consoActuel ",consoActuel)

                    // Calcul des consommations prévues
                    // const conso_prev_min_m2 = getDpeConso.consommation_min * coutEnergy;
                    // const conso_prev_average_m2 = getDpeConso.consommation_moyenne * coutEnergy;
                    // const conso_prev_max_m2 = getDpeConso.consommation_max * coutEnergy;
            
                    // // Finalisation des calculs
                    // const conso_prev_min = conso_prev_min_m2 * selectedDpeData.surface_habitable_logement ;
                    // const conso_prev_average = conso_prev_average_m2 * selectedDpeData.surface_habitable_logement;
                    // const conso_prev_max = conso_prev_max_m2 * selectedDpeData.surface_habitable_logement;

                    // const economies_annuelles_min = consoActuel - conso_prev_min ;
                    // const economies_annuelles_average = consoActuel - conso_prev_average;
                    // const economies_annuelles_max = consoActuel - conso_prev_max;

                    // const ROI_MIN = economies_annuelles_min;
                    // const ROI_AVERAGE = economies_annuelles_average;
                    // const ROI_MAX = economies_annuelles_max;


                    // const IPE = await calculateIPE(selectedDpeData);

                    // Sauvegarder dans la table generalTable
                    const insertResponse = await supabase.from('userVerified').insert([
                        {
                            id: user.id,
                            userId: user.id,
                            nom: user.nom,
                            prenom: user.prenom,
                            numero: user.numero,
                            email: user.email || null, // Ajoutez l'email si présent dans `user`
                            code_postal: selectedDpeData ? selectedDpeData.code_postal : null,
                            identifiant_ban: selectedDpeData ? selectedDpeData.identifiant_ban : null,
                            adresse_complete: selectedDpeData ? selectedDpeData.adresse_complete : null,
                            type_batiment: selectedDpeData ? selectedDpeData.type_batiment : null,
                            periode_construction: selectedDpeData ? selectedDpeData.periode_construction : null,
                            etiquette_DPE: selectedDpeData ? selectedDpeData.etiquette_DPE : null,
                            hauteur_sous_plafond: selectedDpeData ? selectedDpeData.hauteur_sous_plafond : null,
                            surface_habitable_logement: selectedDpeData ? selectedDpeData.surface_habitable_logement : null,
                            adresse_brute: selectedDpeData ? selectedDpeData.adresse_brute : null,
                            coordX: selectedDpeData ? selectedDpeData.coordX : null,
                            coordY: selectedDpeData ? selectedDpeData.coordY : null,
                            typeEnergiePrincipaleECS: selectedDpeData ? selectedDpeData.typeEnergiePrincipaleECS : null,
                            conso_5_usages: selectedDpeData ? selectedDpeData.conso_5_usages : null,
                            conso_5_usages_par_m2: selectedDpeData ? selectedDpeData.conso_5_usages_par_m2 : null,
                            conso_chauffage: selectedDpeData ? selectedDpeData.conso_chauffage : null,
                            conso_chauffage_depensier: selectedDpeData ? selectedDpeData.conso_chauffage_depensier : null,
                            conso_eclairage: selectedDpeData ? selectedDpeData.conso_eclairage : null,
                            conso_ecs: selectedDpeData ? selectedDpeData.conso_ecs : null,
                            conso_auxiliaires: selectedDpeData ? selectedDpeData.conso_auxiliaires : null,
                            conso_refroidissement: selectedDpeData ? selectedDpeData.conso_refroidissement : null,
                            chauffage: selectedDpeData ? selectedDpeData.chauffage : null,
                            latitude: latitude || null,
                            longitude: longitude || null,
                            IRE: IRE || null, // Remplir si l'IRE est calculé ou laisser null
                            IPE: IPE || null ,
                            conso_actuel_annuel: consoActuel || null,
                            // conso_prev_dpeB_min_annuel : conso_prev_min || null,
                            // conso_prev_dpeB_average: conso_prev_average || null,
                            // conso_prev_dpeB_max: conso_prev_max,
                            // ROI_MIN : ROI_MIN || null,
                            // ROI_AVERAGE :ROI_AVERAGE || null,
                            // ROI_MAX: ROI_MAX || null,

                        },
                    ]);
                        if (insertResponse.error) {
                            console.error(
                                `Erreur lors de l'insertion des données pour ${user.nom} ${user.prenom}:`,
                                insertResponse.error.message
                            );
                            return null;
                        }
                    return {
                        ...user,
                        combinedData: {
                            address: formattedAddress,
                            geocode: { latitude, longitude },
                            recentMutation,
                            dpeData: selectedDpeData,
                            //chauffage: selectedDpeData ? selectedDpeData.chauffage : null,
                            IRE: IRE || null, // Remplir si l'IRE est calculé ou laisser null
                            IPE: IPE || null ,
                        },

                    };
                } catch (error) {
                    console.error(`Erreur pour l'utilisateur ${user.nom} ${user.prenom}:`, error.message);

                    // En cas d'erreur, retourner l'utilisateur avec l'erreur
                    return { ...user, combinedData: null, error: error.message };
                }
            })
        );

        // Étape 3: Retourner les utilisateurs enrichis
        res.status(200).json({ users: usersCombinedData });
    } catch (error) {
        console.error('Erreur inattendue:', error.message);
        res.status(500).json({ error: 'Erreur inattendue lors de la récupération des données combinées pour les utilisateurs.' });
    }
});




// Route pour définir le statut "success"
app.post('/set-success-status', async (req, res) => {
    const { id } = req.body;

    if (!id) {
        return res.status(400).json({ error: 'Le champ id est requis.' });
    }

    try {
        const { data, error } = await supabase
            .from('userVerified')
            .update({ status: "success" }) // Définit le statut success
            .eq('id', id);

        if (error) {
            console.error('Erreur lors de la mise à jour de userVerified:', error.message);
            return res.status(500).json({ error: 'Erreur lors de la mise à jour du statut.' });
        }

        return res.status(200).json({ message: 'Statut mis à jour avec succès.', data });
    } catch (err) {
        console.error('Erreur serveur:', err.message);
        return res.status(500).json({ error: 'Erreur interne du serveur.' });
    }
});

// Route pour définir le statut "echec"
app.post('/set-echec-status', async (req, res) => {
    const { id } = req.body;

    if (!id) {
        return res.status(400).json({ error: 'Le champ id est requis.' });
    }

    try {
        const { data, error } = await supabase
            .from('userVerified')
            .update({ status: "lost" }) // Définit le statut echec
            .eq('id', id);

        if (error) {
            console.error('Erreur lors de la mise à jour de userVerified:', error.message);
            return res.status(500).json({ error: 'Erreur lors de la mise à jour du statut.' });
        }

        return res.status(200).json({ message: 'Statut mis à jour avec succès.', data });
    } catch (err) {
        console.error('Erreur serveur:', err.message);
        return res.status(500).json({ error: 'Erreur interne du serveur.' });
    }
});






const calculateIRE = async (typeChauffage, selectedDpeData) => {
    try {
        // Vérifier si les données nécessaires sont disponibles
        if (!typeChauffage || !selectedDpeData) {
            throw new Error('Données nécessaires manquantes pour le calcul de l\'IRE.');
        }

        // Étape 1: Récupérer le coût énergétique moyen en fonction du type de chauffage
        const { data: energyData, error: energyError } = await supabase
            .from('energyCosts')
            .select('cout_moyen_kwh')
            .eq('type_chauffage', typeChauffage)
            .single();

        if (energyError || !energyData) {
            console.error('Erreur lors de la récupération du coût énergétique moyen :', energyError);
            throw new Error('Impossible de récupérer le coût énergétique moyen.');
        }

        const coutEnergetiqueMoyen = parseFloat(energyData.cout_moyen_kwh);

        // Étape 2: Calculer l'IRE
        const consoParM2 = parseFloat(selectedDpeData.conso_5_usages_par_m2 || 0);
        const surfaceHabitable = parseFloat(selectedDpeData.surface_habitable_logement || 0);

        const IRE = consoParM2 * surfaceHabitable * coutEnergetiqueMoyen;

        // Retourner l'IRE
        return {
            IRE: isNaN(IRE) ? null : IRE,
            coutEnergetiqueMoyen,
        };
    } catch (error) {
        console.error('Erreur lors du calcul de l\'IRE :', error.message);
        throw error; // Renvoyer l'erreur pour la gestion ultérieure
    }
};

app.post('/create-energy-cost', async (req, res) => {
    try {
        // Les données à insérer dans la table
        const energyData = [
            { type_chauffage: 'Bois – Bûches', cout_moyen_kwh: 0.071, annee: 2024 },
            { type_chauffage: 'Bois – Granulés (pellets) ou briquettes', cout_moyen_kwh: 0.093, annee: 2024 },
            { type_chauffage: 'Bois – Plaquettes d’industrie', cout_moyen_kwh: 0.055, annee: 2024 },
            { type_chauffage: 'Bois – Plaquettes forestières', cout_moyen_kwh: 0.065, annee: 2024 },
            { type_chauffage: 'Butane', cout_moyen_kwh: 0.157, annee: 2024 },
            { type_chauffage: 'Charbon', cout_moyen_kwh: 0.096, annee: 2024 },
            { type_chauffage: 'Fioul domestique', cout_moyen_kwh: 0.125, annee: 2024 },
            { type_chauffage: 'GPL', cout_moyen_kwh: 0.165, annee: 2024 },
            { type_chauffage: 'Gaz naturel', cout_moyen_kwh: 0.109, annee: 2024 },
            { type_chauffage: 'Propane', cout_moyen_kwh: 0.182, annee: 2024 },
            { type_chauffage: 'Réseau de Chauffage urbain', cout_moyen_kwh: 0.098, annee: 2024 },
            { type_chauffage: 'Réseau de Froid Urbain', cout_moyen_kwh: null, annee: 2024 },
            { type_chauffage: 'Électricité', cout_moyen_kwh: 0.251, annee: 2024 },
            { type_chauffage: "Électricité d'origine renouvelable utilisée dans le chauffage urbain", cout_moyen_kwh: 0.251, annee: 2024 },
        ];

        // Insérer les données dans la table
        const insertResponse = await supabase.from('energyCosts').insert(energyData);

        // Vérifier les erreurs
        if (insertResponse.error) {
            console.error('Erreur lors de l\'insertion des coûts d\'énergie:', insertResponse.error.message);
            return res.status(500).json({ error: 'Erreur lors de l\'insertion des données dans la table energy_costs.' });
        }

        // Réponse en cas de succès
        res.status(200).json({
            message: 'Les données des coûts d\'énergie ont été insérées avec succès.',
            inserted: insertResponse.data,
        });
    } catch (error) {
        console.error('Erreur inattendue:', error.message);
        res.status(500).json({ error: 'Erreur inattendue lors de l\'insertion des coûts d\'énergie.' });
    }
});



// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
