// Static data for demo (replace with real data or database query later)
const locations = [
    { name: "Adrar", municipalities: ["Adrar", "Reggane", "In Salah"] },
    { name: "Chlef", municipalities: ["Chlef", "Ténès", "Ouled Fares"] },
    { name: "Laghouat", municipalities: ["Laghouat", "Aflou", "Brida"] },
    { name: "Oum El Bouaghi", municipalities: ["Oum El Bouaghi", "Ain Beida", "Meskiana"] },
    { name: "Batna", municipalities: ["Batna", "Arris", "N'Gaous"] },
    { name: "Béjaïa", municipalities: ["Béjaïa", "Akbou", "Tichy"] },
    { name: "Biskra", municipalities: ["Biskra", "Tolga", "Ouled Djellal"] },
    { name: "Béchar", municipalities: ["Béchar", "Kenadsa", "Taghit"] },
    { name: "Blida", municipalities: ["Blida", "Boufarik", "Mouzaïa"] },
    { name: "Bouira", municipalities: ["Bouira", "Lakhdaria", "Sour El Ghozlane"] },
    { name: "Tamanrasset", municipalities: ["Tamanrasset", "Abalessa", "In Guezzam"] },
    { name: "Tébessa", municipalities: ["Tébessa", "El Kouif", "Bir el Ater"] },
    { name: "Tlemcen", municipalities: ["Tlemcen", "Maghnia", "Ghazaouet"] },
    { name: "Tiaret", municipalities: ["Tiaret", "Frenda", "Sougueur"] },
    { name: "Tizi Ouzou", municipalities: ["Tizi Ouzou", "Draa Ben Khedda", "Azazga"] },
    { name: "Algiers", municipalities: ["Alger Centre", "Bab El Oued", "El Harrach"] },
    { name: "Djelfa", municipalities: ["Djelfa", "Aïn Oussera", "Hassi Bahbah"] },
    { name: "Jijel", municipalities: ["Jijel", "El Milia", "Taher"] },
    { name: "Sétif", municipalities: ["Sétif", "El Eulma", "Aïn Oulmene"] },
    { name: "Saïda", municipalities: ["Saïda", "El Khemis", "Youb"] },
    { name: "Skikda", municipalities: ["Skikda", "Collo", "El Harrouch"] },
    { name: "Sidi Bel Abbès", municipalities: ["Sidi Bel Abbès", "Télagh", "Ras El Ma"] },
    { name: "Annaba", municipalities: ["Annaba", "El Bouni", "Seraïdi"] },
    { name: "Guelma", municipalities: ["Guelma", "Bouchegouf", "Héliopolis"] },
    { name: "Constantine", municipalities: ["Constantine", "El Khroub", "Aïn Smara"] },
    { name: "Médéa", municipalities: ["Médéa", "Beni Slimane", "Berrouaghia"] },
    { name: "Mostaganem", municipalities: ["Mostaganem", "Aïn Nouissy", "Hassi Mameche"] },
    { name: "M'Sila", municipalities: ["M'Sila", "Boussaâda", "Aïn El Hadjel"] },
    { name: "Mascara", municipalities: ["Mascara", "Tighennif", "Sig"] },
    { name: "Ouargla", municipalities: ["Ouargla", "Hassi Messaoud", "Touggourt"] },
    { name: "Oran", municipalities: ["Oran", "Es Sénia", "Bir El Djir"] },
    { name: "El Bayadh", municipalities: ["El Bayadh", "Rogassa", "Bougtoub"] },
    { name: "Illizi", municipalities: ["Illizi", "Djanet", "Bordj El Houasse"] },
    { name: "Bordj Bou Arreridj", municipalities: ["Bordj Bou Arreridj", "Ras El Oued", "El Ach"] },
    { name: "Boumerdès", municipalities: ["Boumerdès", "Khemis El Khechna", "Bordj Menaïel"] },
    { name: "El Tarf", municipalities: ["El Tarf", "El Kala", "Bouteldja"] },
    { name: "Tindouf", municipalities: ["Tindouf", "Oum El Assel"] },
    { name: "Tissemsilt", municipalities: ["Tissemsilt", "Bordj Bounaama", "Theniet El Had"] },
    { name: "El Oued", municipalities: ["El Oued", "Guemar", "Robbah"] },
    { name: "Khenchela", municipalities: ["Khenchela", "El Hamma", "Babar"] },
    { name: "Souk Ahras", municipalities: ["Souk Ahras", "Sedrata", "Hanancha"] },
    { name: "Tipaza", municipalities: ["Tipaza", "Cherchell", "Gouraya"] },
    { name: "Mila", municipalities: ["Mila", "Ferdjioua", "Chelghoum Laïd"] },
    { name: "Aïn Defla", municipalities: ["Aïn Defla", "Miliana", "El Abadia"] },
    { name: "Naâma", municipalities: ["Naâma", "Aïn Sefra", "Méchria"] },
    { name: "Aïn Témouchent", municipalities: ["Aïn Témouchent", "El Malah", "Beni Saf"] },
    { name: "Ghardaïa", municipalities: ["Ghardaïa", "Metlili", "Berriane"] },
    { name: "Relizane", municipalities: ["Relizane", "Oued Rhiou", "Mendes"] },
    { name: "Timimoun", municipalities: ["Timimoun", "Charouine", "Ouled Said"] },
    { name: "Bordj Badji Mokhtar", municipalities: ["Bordj Badji Mokhtar", "Timiaouine"] },
    { name: "Ouled Djellal", municipalities: ["Ouled Djellal", "Sidi Khaled", "Doucen"] },
    { name: "Béni Abbès", municipalities: ["Béni Abbès", "Kerzaz", "Beni Ikhlef"] },
    { name: "In Salah", municipalities: ["In Salah", "Foggaret Ezzoua", "In Ghar"] },
    { name: "In Guezzam", municipalities: ["In Guezzam", "Tin Zaouatine"] },
    { name: "Touggourt", municipalities: ["Touggourt", "Temacine", "Megarine"] },
    { name: "Djanet", municipalities: ["Djanet", "Bordj El Haouass"] },
    { name: "El M'Ghair", municipalities: ["El M'Ghair", "Djamaa", "Sidi Khelil"] },
    { name: "El Menia", municipalities: ["El Menia", "Hassi Gara"] }
];



class LocationController {
    getLocations = (req, res) => {
        res.json({ provinces: locations });
    };
}

module.exports = new LocationController();