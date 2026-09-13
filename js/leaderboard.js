/**
 * leaderboard.js - Modern Gamified Student Leaderboard & Ranks Suite for ExcellenceCA
 * 
 * Features:
 * - 19 Unique Educational Gaming Ranks (Rookie III to Sovereign 80,000+ XP)
 * - Complete Privacy: ZERO exposure of platform-wide rankings or total student counts
 * - Official India 28 States & 8 Union Territories with dynamic & searchable District filter
 * - Context-aware XP Engine: dynamic recalculation by Subject and Exam Level
 * - Multi-Faceted 6-way Filtering: Rank, Exam Level, Subject, State, District, City + Student Search
 * - Clean "CLEAR FILTERS" button restoring default view instantly
 * - Top 3 Elevated Podium (#1 Gold center, #2 Silver left, #3 Bronze right)
 * - Vector Badge System (9 unique SVG themes for all 19 tiers)
 * - Dynamic Rank Progression Bar with context-aware XP
 * - Sticky Position Card with contextual rank & jump
 * - Premium Rank-Up Celebration Modal
 */

// =========================================================================
// COMPLETE OFFICIAL INDIA 28 STATES & 8 UNION TERRITORIES WITH DISTRICTS
// =========================================================================
const INDIA_STATES_AND_DISTRICTS = {
  // 28 STATES
  "Andhra Pradesh": [
    "Alluri Sitharama Raju", "Anakapalli", "Ananthapuramu", "Annamayya", "Bapatla", "Chittoor",
    "Dr. B.R. Ambedkar Konaseema", "East Godavari", "Eluru", "Guntur", "Kakinada", "Krishna",
    "Kurnool", "Nandyal", "NTR", "Palnadu", "Parvathipuram Manyam", "Prakasam",
    "Sri Potti Sriramulu Nellore", "Sri Sathya Sai", "Srikakulam", "Tirupati", "Visakhapatnam",
    "Vizianagaram", "West Godavari", "YSR"
  ],
  "Arunachal Pradesh": [
    "Anjaw", "Changlang", "Dibang Valley", "East Kameng", "East Siang", "Itanagar Capital Complex",
    "Kamle", "Kra Daadi", "Kurung Kumey", "Lepa Rada", "Lohit", "Longding", "Lower Dibang Valley",
    "Lower Siang", "Lower Subansiri", "Namsai", "Pakke Kessang", "Papum Pare", "Shi Yomi",
    "Siang", "Tawang", "Tirap", "Upper Siang", "Upper Subansiri", "West Kameng", "West Siang"
  ],
  "Assam": [
    "Baksa", "Barpeta", "Bongaigaon", "Cachar", "Charaideo", "Chirang", "Darrang", "Dhemaji",
    "Dhubri", "Dibrugarh", "Dima Hasao", "Goalpara", "Golaghat", "Hailakandi", "Jorhat",
    "Kamrup", "Kamrup Metropolitan", "Karbi Anglong", "Karimganj", "Kokrajhar", "Lakhimpur",
    "Majuli", "Morigaon", "Nagaon", "Nalbari", "Sivasagar", "Sonitpur", "South Salmara-Mankachar",
    "Tinsukia", "Udalguri", "West Karbi Anglong"
  ],
  "Bihar": [
    "Araria", "Arwal", "Aurangabad", "Banka", "Begusarai", "Bhagalpur", "Bhojpur", "Buxar",
    "Darbhanga", "East Champaran", "Gaya", "Gopalganj", "Jamui", "Jehanabad", "Kaimur",
    "Katihar", "Khagaria", "Kishanganj", "Lakhisarai", "Madhepura", "Madhubani", "Munger",
    "Muzaffarpur", "Nalanda", "Nawada", "Patna", "Purnia", "Rohtas", "Saharsa", "Samastipur",
    "Saran", "Sheikhpura", "Sheohar", "Sitamarhi", "Siwan", "Supaul", "Vaishali", "West Champaran"
  ],
  "Chhattisgarh": [
    "Balod", "Baloda Bazar", "Balrampur", "Bastar", "Bemetara", "Bijapur", "Bilaspur",
    "Dantewada", "Dhamtari", "Durg", "Gariaband", "Gaurela-Pendra-Marwahi", "Janjgir-Champa",
    "Jashpur", "Kabirdham", "Kanker", "Khairagarh-Chhuikhadan-Gandai", "Kondagaon", "Korba",
    "Koriya", "Mahasamund", "Manendragarh-Chirmiri-Bharatpur", "Mohla-Manpur-Ambagarh Chowki",
    "Mungeli", "Narayanpur", "Raigarh", "Raipur", "Rajnandgaon", "Sarangarh-Bilaigarh",
    "Sakti", "Sukma", "Surajpur", "Surguja"
  ],
  "Goa": [
    "North Goa", "South Goa"
  ],
  "Gujarat": [
    "Ahmedabad", "Amreli", "Anand", "Aravalli", "Banaskantha", "Bharuch", "Bhavnagar",
    "Botad", "Chhota Udaipur", "Dahod", "Dang", "Devbhoomi Dwarka", "Gandhinagar",
    "Gir Somnath", "Jamnagar", "Junagadh", "Kheda", "Kutch", "Mahisagar", "Mehsana",
    "Morbi", "Narmada", "Navsari", "Panchmahal", "Patan", "Porbandar", "Rajkot",
    "Sabarkantha", "Surat", "Surendranagar", "Tapi", "Vadodara", "Valsad"
  ],
  "Haryana": [
    "Ambala", "Bhiwani", "Charkhi Dadri", "Faridabad", "Fatehabad", "Gurugram", "Hisar",
    "Jhajjar", "Jind", "Kaithal", "Karnal", "Kurukshetra", "Mahendragarh", "Nuh",
    "Palwal", "Panchkula", "Panipat", "Rewari", "Rohtak", "Sirsa", "Sonipat", "Yamunanagar"
  ],
  "Himachal Pradesh": [
    "Bilaspur", "Chamba", "Hamirpur", "Kangra", "Kinnaur", "Kullu", "Lahaul and Spiti",
    "Mandi", "Shimla", "Sirmaur", "Solan", "Una"
  ],
  "Jharkhand": [
    "Bokaro", "Chatra", "Deoghar", "Dhanbad", "Dumka", "East Singhbhum", "Garhwa",
    "Giridih", "Godda", "Gumla", "Hazaribagh", "Jamtara", "Khunti", "Koderma",
    "Latehar", "Lohardaga", "Pakur", "Palamu", "Ramgarh", "Ranchi", "Sahibganj",
    "Seraikela Kharsawan", "Simdega", "West Singhbhum"
  ],
  "Karnataka": [
    "Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban", "Bidar",
    "Chamarajanagar", "Chikkaballapur", "Chikkamagaluru", "Chitradurga", "Dakshina Kannada",
    "Davanagere", "Dharwad", "Gadag", "Hassan", "Haveri", "Kalaburagi", "Kodagu",
    "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur", "Ramanagara", "Shivamogga",
    "Tumakuru", "Udupi", "Uttara Kannada", "Vijayanagara", "Vijayapura", "Yadgir"
  ],
  "Kerala": [
    "Alappuzha", "Ernakulam", "Idukki", "Kannur", "Kasaragod", "Kollam", "Kottayam",
    "Kozhikode", "Malappuram", "Palakkad", "Pathanamthitta", "Thiruvananthapuram", "Thrissur", "Wayanad"
  ],
  "Madhya Pradesh": [
    "Agar Malwa", "Alirajpur", "Anuppur", "Ashoknagar", "Balaghat", "Barwani", "Betul",
    "Bhind", "Bhopal", "Burhanpur", "Chhatarpur", "Chhindwara", "Damoh", "Datia",
    "Dewas", "Dhar", "Dindori", "Guna", "Gwalior", "Harda", "Hoshangabad", "Indore",
    "Jabalpur", "Jhabua", "Katni", "Khandwa", "Khargone", "Mandla", "Mandsaur", "Morena",
    "Narsinghpur", "Neemuch", "Niwari", "Panna", "Raisen", "Rajgarh", "Ratlam", "Rewa",
    "Sagar", "Satna", "Sehore", "Seoni", "Shahdol", "Shajapur", "Sheopur", "Shivpuri",
    "Sidhi", "Singrauli", "Tikamgarh", "Ujjain", "Umaria", "Vidisha"
  ],
  "Maharashtra": [
    "Ahmednagar", "Akola", "Amravati", "Chhatrapati Sambhajinagar", "Beed", "Bhandara",
    "Buldhana", "Chandrapur", "Dhule", "Gadchiroli", "Gondia", "Hingoli", "Jalgaon",
    "Jalna", "Kolhapur", "Latur", "Mumbai City", "Mumbai Suburban", "Nagpur", "Nanded",
    "Nandurbar", "Nashik", "Osmanabad", "Palghar", "Parbhani", "Pune", "Raigad",
    "Ratnagiri", "Sangli", "Satara", "Sindhudurg", "Solapur", "Thane", "Wardha",
    "Washim", "Yavatmal"
  ],
  "Manipur": [
    "Bishnupur", "Chandel", "Churachandpur", "Imphal East", "Imphal West", "Jiribam",
    "Kakching", "Kamjong", "Kangpokpi", "Noney", "Pherzawl", "Senapati", "Tamenglong",
    "Tengnoupal", "Thoubal", "Ukhrul"
  ],
  "Meghalaya": [
    "East Garo Hills", "East Jaintia Hills", "East Khasi Hills", "Eastern West Khasi Hills",
    "North Garo Hills", "Ri Bhoi", "South Garo Hills", "South West Garo Hills",
    "South West Khasi Hills", "West Garo Hills", "West Jaintia Hills", "West Khasi Hills"
  ],
  "Mizoram": [
    "Aizawl", "Champhai", "Hnahthial", "Khawzawl", "Kolasib", "Lawngtlai",
    "Lunglei", "Mamit", "Saiha", "Saitual", "Serchhip"
  ],
  "Nagaland": [
    "Chümoukedima", "Dimapur", "Kiphire", "Kohima", "Longleng", "Mokokchung",
    "Mon", "Niuland", "Noklak", "Peren", "Phek", "Shamator", "Tseminyü",
    "Tuensang", "Wokha", "Zünheboto"
  ],
  "Odisha": [
    "Angul", "Balangir", "Balasore", "Bargarh", "Bhadrak", "Boudh", "Cuttack",
    "Deogarh", "Dhenkanal", "Gajapati", "Ganjam", "Jagatsinghpur", "Jajpur",
    "Jharsuguda", "Kalahandi", "Kandhamal", "Kendrapara", "Kendujhar", "Khordha",
    "Koraput", "Malkangiri", "Mayurbhanj", "Nabarangpur", "Nayagarh", "Nuapada",
    "Puri", "Rayagada", "Sambalpur", "Subarnapur", "Sundergarh"
  ],
  "Punjab": [
    "Amritsar", "Barnala", "Bathinda", "Faridkot", "Fatehgarh Sahib", "Fazilka",
    "Ferozepur", "Gurdaspur", "Hoshiarpur", "Jalandhar", "Kapurthala", "Ludhiana",
    "Malerkotla", "Mansa", "Moga", "Muktsar", "Pathankot", "Patiala", "Rupnagar",
    "Sahibzada Ajit Singh Nagar", "Sangrur", "Shahid Bhagat Singh Nagar", "Tarn Taran"
  ],
  "Rajasthan": [
    "Ajmer", "Alwar", "Banswara", "Baran", "Barmer", "Bharatpur", "Bhilwara",
    "Bikaner", "Bundi", "Chittorgarh", "Churu", "Dausa", "Dholpur", "Dungarpur",
    "Hanumangarh", "Jaipur", "Jaisalmer", "Jalore", "Jhalawar", "Jhunjhunu",
    "Jodhpur", "Karauli", "Kota", "Nagaur", "Pali", "Pratapgarh", "Rajsamand",
    "Sawai Madhopur", "Sikar", "Sirohi", "Sri Ganganagar", "Tonk", "Udaipur"
  ],
  "Sikkim": [
    "Gangtok", "Gyalshing", "Mangan", "Namchi", "Pakyong", "Soreng"
  ],
  "Tamil Nadu": [
    "Ariyalur", "Chengalpattu", "Chennai", "Coimbatore", "Cuddalore", "Dharmapuri",
    "Dindigul", "Erode", "Kallakurichi", "Kanchipuram", "Kanyakumari", "Karur",
    "Krishnagiri", "Madurai", "Mayiladuthurai", "Nagapattinam", "Namakkal", "Nilgiris",
    "Perambalur", "Pudukkottai", "Ramanathapuram", "Ranipet", "Salem", "Sivaganga",
    "Tenkasi", "Thanjavur", "Theni", "Thoothukudi", "Tiruchirappalli", "Tirunelveli",
    "Tirupathur", "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur", "Vellore",
    "Viluppuram", "Virudhunagar"
  ],
  "Telangana": [
    "Adilabad", "Bhadradri Kothagudem", "Hanumakonda", "Hyderabad", "Jagtial", "Jangaon",
    "Jayashankar Bhupalpally", "Jogulamba Gadwal", "Kamareddy", "Karimnagar", "Khammam",
    "Kumuram Bheem", "Mahabubabad", "Mahbubnagar", "Mancherial", "Medak", "Medchal-Malkajgiri",
    "Mulugu", "Nagarkurnool", "Nalgonda", "Narayanpet", "Nirmal", "Nizamabad", "Peddapalli",
    "Rajanna Sircilla", "Rangareddy", "Sangareddy", "Siddipet", "Suryapet", "Vikarabad",
    "Wanaparthy", "Warangal", "Yadadri Bhuvanagiri"
  ],
  "Tripura": [
    "Dhalai", "Gomati", "Khowai", "North Tripura", "Sepahijala", "South Tripura",
    "Unakoti", "West Tripura"
  ],
  "Uttar Pradesh": [
    "Agra", "Aligarh", "Ambedkar Nagar", "Amethi", "Amroha", "Auraiya", "Ayodhya",
    "Azamgarh", "Baghpat", "Bahraich", "Ballia", "Balrampur", "Banda", "Barabanki",
    "Bareilly", "Basti", "Bhadohi", "Bijnor", "Budaun", "Bulandshahr", "Chandauli",
    "Chitrakoot", "Deoria", "Etah", "Etawah", "Farrukhabad", "Fatehpur", "Firozabad",
    "Gautam Buddha Nagar", "Ghaziabad", "Ghazipur", "Gonda", "Gorakhpur", "Hamirpur",
    "Hapur", "Hardoi", "Hathras", "Jalaun", "Jaunpur", "Jhansi", "Kannauj",
    "Kanpur Dehat", "Kanpur Nagar", "Kasganj", "Kaushambi", "Kheri", "Kushinagar",
    "Lalitpur", "Lucknow", "Maharajganj", "Mahoba", "Mainpuri", "Mathura", "Mau",
    "Meerut", "Mirzapur", "Moradabad", "Muzaffarnagar", "Pilibhit", "Pratapgarh",
    "Prayagraj", "Raebareli", "Rampur", "Saharanpur", "Sambhal", "Sant Kabir Nagar",
    "Shahjahanpur", "Shamli", "Shrawasti", "Siddharthnagar", "Sitapur", "Sonbhadra",
    "Sultanpur", "Unnao", "Varanasi"
  ],
  "Uttarakhand": [
    "Almora", "Bageshwar", "Chamoli", "Champawat", "Dehradun", "Haridwar",
    "Nainital", "Pauri Garhwal", "Pithoragarh", "Rudraprayag", "Tehri Garhwal",
    "Udham Singh Nagar", "Uttarkashi"
  ],
  "West Bengal": [
    "Alipurduar", "Bankura", "Birbhum", "Cooch Behar", "Dakshin Dinajpur", "Darjeeling",
    "Hooghly", "Howrah", "Jalpaiguri", "Jhargram", "Kalimpong", "Kolkata", "Malda",
    "Murshidabad", "Nadia", "North 24 Parganas", "Paschim Bardhaman", "Paschim Medinipur",
    "Purba Bardhaman", "Purba Medinipur", "Purulia", "South 24 Parganas", "Uttar Dinajpur"
  ],

  // 8 UNION TERRITORIES
  "Andaman and Nicobar Islands": [
    "Nicobar", "North and Middle Andaman", "South Andaman"
  ],
  "Chandigarh": [
    "Chandigarh"
  ],
  "Dadra and Nagar Haveli and Daman and Diu": [
    "Dadra and Nagar Haveli", "Daman", "Diu"
  ],
  "Delhi": [
    "Central Delhi", "East Delhi", "New Delhi", "North Delhi", "North East Delhi",
    "North West Delhi", "Shahdara", "South Delhi", "South East Delhi", "South West Delhi", "West Delhi"
  ],
  "Jammu and Kashmir": [
    "Anantnag", "Bandipora", "Baramulla", "Budgam", "Doda", "Ganderbal", "Jammu",
    "Kathua", "Kishtwar", "Kulgam", "Kupwara", "Poonch", "Pulwama", "Rajouri",
    "Ramban", "Reasi", "Samba", "Shopian", "Srinagar", "Udhampur"
  ],
  "Ladakh": [
    "Kargil", "Leh"
  ],
  "Lakshadweep": [
    "Lakshadweep"
  ],
  "Puducherry": [
    "Karaikal", "Mahe", "Puducherry", "Yanam"
  ]
};
window.INDIA_STATES_AND_DISTRICTS = INDIA_STATES_AND_DISTRICTS;

class LeaderboardManager {
  constructor() {
    this.selectedRankFilter = 'all';
    this.selectedExamLevelFilter = 'all';
    this.selectedSubjectFilter = 'all';
    this.selectedStateFilter = 'all';
    this.selectedDistrictFilter = 'all';
    this.selectedCityFilter = 'all';
    this.searchQuery = '';

    // Searchable combobox input text states
    this.stateSearchText = '';
    this.districtSearchText = '';
    this.stateDropdownOpen = false;
    this.districtDropdownOpen = false;

    this.cachedStandings = [];
    this.currentPage = 1;
    this.pageSize = 10;

    // Global listener for click-outside to close comboboxes
    if (typeof window !== 'undefined') {
      window.addEventListener('click', (e) => {
        if (!e.target.closest('#lb-state-combobox-container')) {
          this.closeStateDropdown();
        }
        if (!e.target.closest('#lb-district-combobox-container')) {
          this.closeDistrictDropdown();
        }
      });
    }
  }

  // ==========================================
  // 1. VECTOR BADGE SYSTEM (All 19 Tiers)
  // ==========================================
  getTierBadgeSvg(tier, size = 32) {
    if (!tier) return '';
    const family = tier.family || 'Rookie';
    const num = tier.tierNumber || 1; // 3, 2, or 1

    const themes = {
      Rookie: {
        primary: '#b45309',
        secondary: '#d97706',
        accent: '#fef3c7',
        border: '#92400e',
        glow: 'rgba(180, 83, 9, 0.25)',
        iconPath: 'M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5zm0 4.5l5 3v4.5c0 3.5-2.2 6.8-5 7.8-2.8-1-5-4.3-5-7.8V9.5l5-3z'
      },
      Scholar: {
        primary: '#0284c7',
        secondary: '#38bdf8',
        accent: '#e0f2fe',
        border: '#0369a1',
        glow: 'rgba(2, 132, 199, 0.25)',
        iconPath: 'M12 3L1 9l11 6 9-4.91V17h2V9L12 3z M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z'
      },
      Achiever: {
        primary: '#d97706',
        secondary: '#fbbf24',
        accent: '#fffbeb',
        border: '#b45309',
        glow: 'rgba(217, 119, 6, 0.3)',
        iconPath: 'M12 2l2.9 6.2 6.8.9-5 4.8 1.3 6.8-6-3.3-6 3.3 1.3-6.8-5-4.8 6.8-.9L12 2z'
      },
      Elite: {
        primary: '#4f46e5',
        secondary: '#818cf8',
        accent: '#e0e7ff',
        border: '#3730a3',
        glow: 'rgba(79, 70, 229, 0.3)',
        iconPath: 'M12 1L3 8l9 14 9-14L12 1zm0 3.2L18.4 8H5.6L12 4.2zM5.2 9.5h13.6L12 20.1 5.2 9.5z'
      },
      Master: {
        primary: '#e11d48',
        secondary: '#fb7185',
        accent: '#ffe4e6',
        border: '#9f1239',
        glow: 'rgba(225, 29, 72, 0.35)',
        iconPath: 'M12 2L4 7v10l8 5 8-5V7l-8-5zm0 3.5l5.5 3.5v7L12 19.5 6.5 16V9L12 5.5zm0 3a3.5 3.5 0 100 7 3.5 3.5 0 000-7z'
      },
      Apex: {
        primary: '#059669',
        secondary: '#34d399',
        accent: '#d1fae5',
        border: '#065f46',
        glow: 'rgba(5, 150, 105, 0.35)',
        iconPath: 'M12 2L2 9l10 13 10-13L12 2zm0 3.8l6.8 4.7L12 19.2 5.2 10.5 12 5.8z M12 9l-3 3h6l-3-3z'
      },
      Titan: {
        primary: '#2563eb',
        secondary: '#60a5fa',
        accent: '#dbeafe',
        border: '#1e40af',
        glow: 'rgba(37, 99, 235, 0.4)',
        iconPath: 'M19 4h-2V2h-2v2H9V2H7v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V8h14v12zm-7-10l-4 4h3v4h2v-4h3l-4-4z'
      },
      Legend: {
        primary: '#7c3aed',
        secondary: '#a78bfa',
        accent: '#ede9fe',
        border: '#5b21b6',
        glow: 'rgba(124, 58, 237, 0.45)',
        iconPath: 'M12 2L9.2 8.6 2 9.2l5.5 4.8L5.8 21 12 17.3 18.2 21l-1.7-7 5.5-4.8-7.2-.6L12 2z M12 6.3l1.8 4.2 4.6.4-3.5 3 1.1 4.5-4-2.4-4 2.4 1.1-4.5-3.5-3 4.6-.4L12 6.3z'
      },
      Sovereign: {
        primary: '#b45309',
        secondary: '#f59e0b',
        accent: '#fef3c7',
        border: '#78350f',
        glow: 'rgba(245, 158, 11, 0.55)',
        iconPath: 'M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1v-1h14v1z'
      }
    };

    const theme = themes[family] || themes.Rookie;

    let pips = '';
    if (family !== 'Apex' && family !== 'Titan' && family !== 'Legend' && family !== 'Sovereign') {
      const pipsCount = num === 3 ? 1 : num === 2 ? 2 : 3;
      pips = Array.from({ length: pipsCount }).map((_, i) => {
        const offset = pipsCount === 1 ? 12 : pipsCount === 2 ? (i === 0 ? 10 : 14) : (8 + i * 4);
        return `<circle cx="${offset}" cy="21" r="1.2" fill="${theme.secondary}" stroke="${theme.border}" stroke-width="0.3" />`;
      }).join('');
    }

    const tierId = (tier && tier.id) ? tier.id : (`tier-${(family || 'rookie').toLowerCase()}-${num}-${size}`);

    return `
      <svg width="${size}" height="${size}" viewBox="0 0 24 24" class="inline-block flex-shrink-0 drop-shadow-sm transition-transform hover:scale-105" title="${tier.name || 'Rank Tier'}">
        <defs>
          <linearGradient id="grad-${tierId}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${theme.secondary}" />
            <stop offset="100%" stop-color="${theme.primary}" />
          </linearGradient>
          <filter id="glow-${tierId}" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="${theme.glow}" />
          </filter>
        </defs>
        <path d="${theme.iconPath}" fill="url(#grad-${tierId})" stroke="${theme.border}" stroke-width="0.75" filter="url(#glow-${tierId})" />
        ${pips}
      </svg>
    `;
  }

  renderTierEmblemSvg(tier, size = 32) {
    return this.getTierBadgeSvg(tier, size);
  }

  // ==========================================
  // 2. CONTEXT-AWARE XP CALCULATION ENGINE
  // ==========================================
  calculateStudentXp(student, allAttempts, allSubmissions, xpSettings, context = {}) {
    if (!student) return { totalXp: 0, mcqXp: 0, descriptiveXp: 0, referralXp: 0, baseXp: 0, correctQuestions: 0 };

    const subjectFilter = (context.subject || 'all').toLowerCase();
    const examLevelFilter = (context.examLevel || 'all').toLowerCase();

    const isSubjectFiltered = subjectFilter !== 'all';
    const isLevelFiltered = examLevelFilter !== 'all';

    const allTests = window.store ? window.store.getTests() : [];
    const allAssignments = window.store ? window.store.getAssignments() : [];
    const allSubjects = window.store ? window.store.getSubjects() : [];

    const testsMap = {};
    allTests.forEach(t => { testsMap[t.id] = t; });

    const assignmentsMap = {};
    allAssignments.forEach(a => { assignmentsMap[a.id] = a; });

    const subjectsMap = {};
    allSubjects.forEach(s => { 
      subjectsMap[s.id] = s;
      subjectsMap[s.name.toLowerCase()] = s;
    });

    const studentAttempts = allAttempts.filter(a => a.userId === student.id);
    const studentSubmissions = allSubmissions.filter(s => s.studentId === student.id && s.status === 'Evaluated');

    // A) MCQ XP
    const testBestMap = {};
    let totalCorrectCount = 0;

    studentAttempts.forEach(att => {
      const test = testsMap[att.testId];
      if (!test) return;

      const subObj = subjectsMap[test.subjectId];
      const testSubjectName = (subObj ? subObj.name : (test.subject || '')).toLowerCase();
      const testLevel = (test.examLevel || (subObj && subObj.level ? subObj.level : (test.level || 'CA Foundation'))).toLowerCase();

      // Check subject match
      if (isSubjectFiltered && testSubjectName !== subjectFilter && test.subjectId !== subjectFilter) {
        return;
      }

      // Check exam level match
      if (isLevelFiltered && !testLevel.includes(examLevelFilter.replace('ca ', ''))) {
        return;
      }

      const earnedPoints = (att.earnedPoints !== undefined && att.earnedPoints !== null)
        ? Number(att.earnedPoints)
        : Number(att.grossMarks || att.finalScore || 0);
      const correct = Number(att.correctCount || 0);

      if (!testBestMap[att.testId] || earnedPoints > testBestMap[att.testId].points) {
        testBestMap[att.testId] = { points: earnedPoints, correct: correct };
      }
    });

    let mcqXp = 0;
    Object.values(testBestMap).forEach(item => {
      mcqXp += Math.round(item.points);
      totalCorrectCount += item.correct;
    });

    // B) Descriptive XP
    let descriptiveXp = 0;
    studentSubmissions.forEach(sub => {
      const asg = assignmentsMap[sub.assignmentId];
      if (!asg) return;

      const subObj = subjectsMap[asg.subjectId] || subjectsMap[(asg.subject || '').toLowerCase()];
      const asgSubjectName = (subObj ? subObj.name : (asg.subject || '')).toLowerCase();
      const asgLevel = (asg.examLevel || (subObj && subObj.level ? subObj.level : (asg.level || 'CA Foundation'))).toLowerCase();

      if (isSubjectFiltered && asgSubjectName !== subjectFilter && asg.subjectId !== subjectFilter) {
        return;
      }

      if (isLevelFiltered && !asgLevel.includes(examLevelFilter.replace('ca ', ''))) {
        return;
      }

      const earnedPoints = (sub.pointsAwarded !== undefined && sub.pointsAwarded !== null)
        ? Number(sub.pointsAwarded)
        : Number(sub.marksObtained || 0);
      descriptiveXp += Math.round(earnedPoints);
    });

    // C) Referral XP: strictly for overall view; never applied to subject-only leaderboard
    let referralXp = 0;
    if (!isSubjectFiltered && !isLevelFiltered) {
      const referralXpRate = Number(xpSettings.referralXp || 500);
      referralXp = (Number(student.referralCount || 0)) * referralXpRate;
    }

    // D) Base XP: context-aware
    let baseXp = 0;
    if (isSubjectFiltered) {
      const subjKey = Object.keys(student.subjectXp || {}).find(k => k.toLowerCase() === subjectFilter);
      if (subjKey && student.subjectXp[subjKey] !== undefined) {
        baseXp = Number(student.subjectXp[subjKey]);
      } else {
        baseXp = Math.round(Number(student.baseXp || 0) * 0.25);
      }
    } else if (isLevelFiltered) {
      const studentLevel = (student.caLevel || 'CA Foundation').toLowerCase();
      if (studentLevel.includes(examLevelFilter.replace('ca ', ''))) {
        baseXp = Number(student.baseXp || 0);
      } else {
        baseXp = 0;
      }
    } else {
      baseXp = Number(student.baseXp || 0);
    }

    let totalXp = mcqXp + descriptiveXp + referralXp + baseXp;

    // Hard Fix: If overall view (not subject or level filtered) and student.totalXp is explicitly defined
    // (e.g. after an admin point reset, point deduction, or bulk-set),
    // student.totalXp is authoritative so points never resurrect from historical attempts.
    if (!isSubjectFiltered && !isLevelFiltered && student.totalXp !== undefined && student.totalXp !== null) {
      totalXp = Number(student.totalXp);
    }

    return {
      totalXp: Math.max(0, totalXp),
      mcqXp,
      descriptiveXp,
      referralXp,
      baseXp,
      correctQuestions: totalCorrectCount
    };
  }

  // ==========================================
  // 3. TIER RESOLVER & PROGRESSION
  // ==========================================
  resolveTier(totalXp, rankTiers) {
    if (!rankTiers || rankTiers.length === 0) {
      rankTiers = window.store ? window.store.getRankTiers() : [];
    }
    if (!rankTiers || rankTiers.length === 0) {
      return {
        currentTier: { id: 'rookie_3', name: 'Rookie III', family: 'Rookie', minXp: 0 },
        nextTier: null,
        xpToNext: 0,
        progressPercent: 100,
        isMaxRank: false
      };
    }

    let currentTier = rankTiers[0];
    let currentIndex = 0;

    for (let i = 0; i < rankTiers.length; i++) {
      if (totalXp >= rankTiers[i].minXp) {
        currentTier = rankTiers[i];
        currentIndex = i;
      }
    }

    const isMaxRank = currentIndex === rankTiers.length - 1;
    const nextTier = !isMaxRank ? rankTiers[currentIndex + 1] : null;

    let xpToNext = 0;
    let progressPercent = 100;

    if (!isMaxRank && nextTier) {
      xpToNext = Math.max(0, nextTier.minXp - totalXp);
      const range = nextTier.minXp - currentTier.minXp;
      const progress = totalXp - currentTier.minXp;
      progressPercent = range > 0 ? Math.min(100, Math.max(0, Math.round((progress / range) * 100))) : 100;
    }

    return {
      currentTier,
      nextTier,
      xpToNext,
      progressPercent,
      isMaxRank
    };
  }

  // ==========================================
  // 4. STANDINGS CALCULATION (CONTEXTUAL)
  // ==========================================
  calculateAllStandings() {
    const students = window.store ? window.store.getStudents().filter(s => s.isActive !== false) : [];
    const allAttempts = window.store ? window.store.getAttempts() : [];
    const allSubmissions = window.store ? window.store.getSubmissions() : [];
    const rankTiers = window.store ? window.store.getRankTiers() : [];
    const xpSettings = window.store ? window.store.getXpSettings() : { referralXp: 500 };

    const context = {
      subject: this.selectedSubjectFilter,
      examLevel: this.selectedExamLevelFilter
    };

    // 1. Calculate context XP for all active students
    const computed = students.map(st => {
      const xpData = this.calculateStudentXp(st, allAttempts, allSubmissions, xpSettings, context);
      const tierData = this.resolveTier(xpData.totalXp, rankTiers);

      let subTier = 'free';
      if (st.subscription && (st.subscription.status === 'active' || st.subscription.status === 'manually_granted')) {
        const exp = st.subscription.expiresAt ? new Date(st.subscription.expiresAt) : null;
        if (!exp || exp > new Date()) {
          subTier = (st.subscription.planTier || st.subscription.tier || 'core').toLowerCase();
        }
      } else if (window.store && typeof window.store.getUserSubscription === 'function') {
        const uSub = window.store.getUserSubscription(st.id);
        if (uSub && (uSub.status === 'active' || uSub.status === 'manually_granted')) {
          const exp = uSub.expiresAt ? new Date(uSub.expiresAt) : null;
          if (!exp || exp > new Date()) {
            subTier = (uSub.planTier || uSub.tier || 'core').toLowerCase();
          }
        }
      }

      return {
        id: st.id,
        name: st.name,
        email: st.email,
        caLevel: st.caLevel || 'CA Student',
        avatar: st.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120',
        state: st.state || 'Uttar Pradesh',
        district: st.district || st.city || 'Meerut',
        city: st.city || 'Meerut',
        totalXp: xpData.totalXp,
        mcqXp: xpData.mcqXp,
        descriptiveXp: xpData.descriptiveXp,
        referralXp: xpData.referralXp,
        correctQuestions: xpData.correctQuestions,
        tier: tierData.currentTier,
        nextTier: tierData.nextTier,
        xpToNext: tierData.xpToNext,
        progressPercent: tierData.progressPercent,
        isMaxRank: tierData.isMaxRank,
        previousRank: st.previousRank || null,
        achievementBadges: st.achievementBadges || [],
        subscriptionTier: subTier
      };
    });

    // 2. Sort by Total Context XP descending
    computed.sort((a, b) => b.totalXp - a.totalXp || b.correctQuestions - a.correctQuestions || a.name.localeCompare(b.name));

    this.cachedStandings = computed;
    return computed;
  }

  getStudentRank(userId) {
    if (!this.cachedStandings || this.cachedStandings.length === 0) {
      this.calculateAllStandings();
    }
    const found = this.cachedStandings.find(s => s.id === userId);
    return found ? (this.cachedStandings.indexOf(found) + 1) : null;
  }

  // ==========================================
  // 5. MAIN RENDER PIPELINE
  // ==========================================
  render() {
    if (!window.auth || !window.auth.isLoggedIn()) {
      const container = document.getElementById('leaderboard-content');
      if (container) {
        container.innerHTML = `
          <div class="max-w-md mx-auto text-center py-16 px-6 bg-white border border-slate-200 rounded-2xl shadow-sm my-8">
            <div class="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 mx-auto flex items-center justify-center mb-4 border border-blue-100 shadow-xs">
              <i data-lucide="lock" class="w-7 h-7"></i>
            </div>
            <h3 class="text-lg font-bold text-slate-900">Student Leaderboard Locked</h3>
            <p class="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Student rankings, XP standings, and state leaderboards are accessible only to registered students. Please sign in or create an account to view student rankings.
            </p>
            <div class="flex items-center justify-center gap-3 mt-6">
              <button onclick="window.app.showAuthModal('login')" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5">
                <i data-lucide="log-in" class="w-4 h-4"></i> Sign In to Account
              </button>
              <button onclick="window.app.navigate('register')" class="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5">
                <i data-lucide="user-plus" class="w-4 h-4 text-blue-600"></i> Register Free
              </button>
            </div>
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();
      }
      return;
    }

    const standings = this.calculateAllStandings();
    const currentUser = window.auth ? window.auth.getCurrentUser() : null;

    // Maintain baseline tier in localStorage without showing rank-up modal on refresh
    if (currentUser && currentUser.role === 'student') {
      const studentStanding = standings.find(s => s.id === currentUser.id);
      if (studentStanding) {
        const key = `excellenceca_last_tier_${currentUser.id}`;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, studentStanding.tier.id);
        }
      }
    }

    const container = document.getElementById('leaderboard-content');
    if (!container) return;

    // Extract dynamic filter values
    const allExamLevels = window.store && window.store.getExamLevels ? window.store.getExamLevels() : ['CA Foundation', 'CA Intermediate', 'CA Final'];
    const allSubjects = window.store ? window.store.getSubjects() : [];

    const filteredStandings = this.filterStandings(standings);

    // Assign sequential contextual rank to each student in filteredStandings
    filteredStandings.forEach((st, idx) => {
      st.contextRank = idx + 1;
    });

    const studentSelf = currentUser ? filteredStandings.find(s => s.id === currentUser.id) : null;
    const isFiltered = this.isAnyFilterActive();

    // Available cities for city filter based on selected state/district
    const availableCities = Array.from(new Set(
      standings
        .filter(s => (this.selectedStateFilter === 'all' || s.state.toLowerCase() === this.selectedStateFilter.toLowerCase()) &&
                     (this.selectedDistrictFilter === 'all' || (s.district || '').toLowerCase() === this.selectedDistrictFilter.toLowerCase()))
        .map(s => s.city)
        .filter(Boolean)
    )).sort();

    container.innerHTML = `
      <div class="space-y-8 max-w-7xl mx-auto">
        
        <!-- HEADER & PERSISTENT STUDENT HERO RANK CARD -->
        <div id="leaderboard-hero-area">
          ${this.renderHeaderAndHeroCard(studentSelf, currentUser, isFiltered, standings)}
        </div>

        <!-- MULTI-FACETED CONTROLS & 6-WAY FILTER BAR -->
        <div id="leaderboard-filterbar-area">
          ${this.renderFilterBar(allExamLevels, allSubjects, availableCities)}
        </div>

        <!-- DYNAMIC RESULTS (PODIUM + TABLE) -->
        <div id="leaderboard-results-area" class="space-y-8">
          ${this.renderResultsArea(filteredStandings, currentUser)}
        </div>

        <!-- STICKY "YOUR POSITION" CARD -->
        <div id="leaderboard-sticky-area">
          ${studentSelf ? this.renderStickyYourPosition(studentSelf) : ''}
        </div>

      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  }

  isAnyFilterActive() {
    return this.selectedRankFilter !== 'all' || 
           this.selectedExamLevelFilter !== 'all' || 
           this.selectedSubjectFilter !== 'all' || 
           this.selectedStateFilter !== 'all' || 
           this.selectedDistrictFilter !== 'all' || 
           this.selectedCityFilter !== 'all' || 
           !!this.searchQuery;
  }

  filterStandings(standings) {
    return (standings || []).filter(st => {
      // 1. Rank filter
      if (this.selectedRankFilter !== 'all') {
        const familyMatch = st.tier.family.toLowerCase() === this.selectedRankFilter.toLowerCase();
        const exactMatch = st.tier.name.toLowerCase() === this.selectedRankFilter.toLowerCase();
        if (!familyMatch && !exactMatch) return false;
      }

      // 2. Exam Level filter
      if (this.selectedExamLevelFilter !== 'all') {
        const normFilter = this.selectedExamLevelFilter.toLowerCase().replace('ca ', '').trim();
        const normStudentLevel = (st.caLevel || '').toLowerCase();
        if (!normStudentLevel.includes(normFilter)) return false;
      }

      // 3. State filter
      if (this.selectedStateFilter !== 'all' && st.state.toLowerCase() !== this.selectedStateFilter.toLowerCase()) {
        return false;
      }

      // 4. District filter
      if (this.selectedDistrictFilter !== 'all' && (st.district || '').toLowerCase() !== this.selectedDistrictFilter.toLowerCase()) {
        return false;
      }

      // 5. City filter
      if (this.selectedCityFilter !== 'all' && st.city.toLowerCase() !== this.selectedCityFilter.toLowerCase()) {
        return false;
      }

      // 6. Search query
      if (this.searchQuery && !st.name.toLowerCase().includes(this.searchQuery.toLowerCase())) {
        return false;
      }

      return true;
    });
  }

  renderResultsArea(filteredStandings, currentUser) {
    return `
      ${filteredStandings.length >= 3 ? this.renderPodium(filteredStandings.slice(0, 3), currentUser) : ''}
      ${this.renderTable(filteredStandings, filteredStandings.length >= 3 ? 3 : 0, currentUser)}
    `;
  }

  // =========================================================================
  // 6. HEADER & STUDENT HERO CARD (STRICT PRIVACY - NO PLATFORM RANK/TOTALS)
  // =========================================================================
  renderHeaderAndHeroCard(studentSelf, currentUser, isFiltered, allStandings) {
    // Build context description tag
    const activeContextTags = [];
    if (this.selectedSubjectFilter !== 'all') activeContextTags.push(this.selectedSubjectFilter.toUpperCase());
    if (this.selectedExamLevelFilter !== 'all') activeContextTags.push(this.selectedExamLevelFilter.toUpperCase());
    if (this.selectedStateFilter !== 'all') activeContextTags.push(this.selectedStateFilter.toUpperCase());
    if (this.selectedDistrictFilter !== 'all') activeContextTags.push(this.selectedDistrictFilter.toUpperCase());
    if (this.selectedCityFilter !== 'all') activeContextTags.push(this.selectedCityFilter.toUpperCase());

    const contextSubtitle = activeContextTags.length > 0 
      ? activeContextTags.join(' • ') 
      : 'COMPETITIVE SEASON 2026';

    if (!currentUser || currentUser.role !== 'student') {
      return `
        <div class="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 sm:p-8 text-white border border-indigo-900/50 shadow-xl relative overflow-hidden">
          <div class="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 mb-3">
                <i data-lucide="zap" class="w-3.5 h-3.5"></i> ${contextSubtitle}
              </div>
              <h1 class="text-2xl sm:text-3xl font-black tracking-tight">Student Leaderboard</h1>
              <p class="text-xs sm:text-sm text-slate-300 mt-1.5 font-medium italic">"Compete. Learn. Level Up."</p>
            </div>
            <div class="flex items-center gap-3">
              <button 
                onclick="window.app.showAuthModal('login')"
                class="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer"
              >
                <i data-lucide="log-in" class="w-4 h-4"></i> Sign In to View Your Rank
              </button>
            </div>
          </div>
        </div>
      `;
    }

    // Student is logged in — ALWAYS render the persistent personal rank card
    const allList = allStandings || (this.cachedStandings && this.cachedStandings.length > 0 ? this.cachedStandings : this.calculateAllStandings());
    const globalRankIndex = allList.findIndex(s => s.id === currentUser.id);
    const globalRank = globalRankIndex >= 0 ? globalRankIndex + 1 : 1;
    const studentRecord = allList.find(s => s.id === currentUser.id) || studentSelf || {
      id: currentUser.id,
      name: currentUser.name || 'Student',
      avatar: currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120',
      caLevel: currentUser.caLevel || 'CA Student',
      state: currentUser.state || 'India',
      district: currentUser.district || '',
      totalXp: window.rankService ? window.rankService.getUserTotalXp(currentUser.id) : (currentUser.totalXp || 0)
    };

    const rankTiers = window.store ? window.store.getRankTiers() : [];
    const tierData = this.resolveTier(studentRecord.totalXp, rankTiers);
    const studentTier = tierData.currentTier;
    const tierBadge = this.getTierBadgeSvg(studentTier, 42);

    const nextTierMinXp = tierData.nextTier ? tierData.nextTier.minXp : studentRecord.totalXp;
    const progressText = tierData.isMaxRank 
      ? 'MAX RANK REACHED • CELESTIAL TIER' 
      : `${studentRecord.totalXp.toLocaleString()} / ${nextTierMinXp.toLocaleString()} XP — ${tierData.xpToNext.toLocaleString()} XP needed for next level`;

    // Determine ranking badges
    const isInsideFilter = !!studentSelf;
    let rankBadgeHtml = '';
    if (isInsideFilter) {
      rankBadgeHtml = `
        <div class="flex items-center gap-2">
          <div class="text-2xl sm:text-3xl font-black text-white font-mono">#${studentSelf.contextRank}</div>
          ${isFiltered ? `<span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-indigo-500/25 text-indigo-200 border border-indigo-500/30" title="Overall Rank #${globalRank}">Global #${globalRank}</span>` : ''}
        </div>
      `;
    } else {
      rankBadgeHtml = `
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <div class="text-2xl sm:text-3xl font-black text-amber-300 font-mono">#${globalRank}</div>
            <span class="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">Overall Standing</span>
          </div>
          <div class="text-[11px] text-amber-200/90 flex items-center gap-1.5">
            <i data-lucide="filter" class="w-3 h-3"></i>
            <span>Outside active filter</span>
            <button onclick="window.leaderboardManager.resetFilters()" class="text-indigo-200 hover:text-white underline font-bold cursor-pointer ml-1">Reset Filters</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 sm:p-8 text-white border border-indigo-900/40 shadow-xl relative overflow-hidden">
        <!-- Ambient background glows -->
        <div class="absolute -right-16 -top-16 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div class="absolute -left-16 -bottom-16 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div class="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          
          <!-- Title & Context Badge -->
          <div>
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 mb-3">
              <i data-lucide="award" class="w-3.5 h-3.5 text-amber-400"></i> ${contextSubtitle}
            </div>
            <h1 class="text-2xl sm:text-3xl font-black tracking-tight text-white">Student Leaderboard</h1>
            <p class="text-xs sm:text-sm text-slate-300 mt-1 font-medium italic">"Compete. Learn. Level Up."</p>
            
            <!-- Context tags -->
            <div class="flex flex-wrap items-center gap-2 mt-4 text-[11px]">
              <span class="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-200 font-semibold border border-indigo-500/30">
                <i data-lucide="map-pin" class="w-3 h-3 inline mr-1"></i>${studentRecord.district ? `${studentRecord.district}, ` : ''}${studentRecord.state}
              </span>
              <span class="px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-200 font-semibold border border-blue-500/30">
                <i data-lucide="book-open" class="w-3 h-3 inline mr-1"></i>${studentRecord.caLevel}
              </span>
            </div>
          </div>

          <!-- Highlighted Student Rank Card (Persistent Real Rank Card) -->
          <div class="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-5 sm:p-6 lg:min-w-[360px] shadow-xl">
            
            <!-- Student Profile Row -->
            <div class="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-white/10">
              <div class="flex items-center gap-3 min-w-0">
                <img 
                  src="${studentRecord.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120'}" 
                  alt="${studentRecord.name}" 
                  class="w-10 h-10 rounded-full object-cover border-2 border-white/20 flex-shrink-0"
                >
                <div class="min-w-0">
                  <div class="font-extrabold text-white text-sm truncate flex items-center gap-1.5">
                    ${studentRecord.name}
                    <span class="text-[9px] font-black uppercase tracking-wider text-blue-200 bg-blue-500/30 px-1.5 py-0.5 rounded border border-blue-400/30">You</span>
                  </div>
                  <div class="text-[11px] text-slate-300 truncate">
                    ${studentRecord.district ? `${studentRecord.district}, ` : ''}${studentRecord.state} • ${studentRecord.caLevel}
                  </div>
                </div>
              </div>
              <div class="text-right flex-shrink-0">
                <span class="text-xs font-black text-emerald-400 font-mono block">${studentRecord.totalXp.toLocaleString()} XP</span>
                <span class="text-[10px] text-indigo-300 font-bold uppercase tracking-wider">${studentTier.name}</span>
              </div>
            </div>

            <!-- Rank & Badge Row -->
            <div class="flex items-center justify-between gap-4 mb-3">
              <div>
                <span class="text-[10px] font-black uppercase tracking-wider text-indigo-300 block mb-0.5">YOUR RANK</span>
                ${rankBadgeHtml}
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                ${tierBadge}
              </div>
            </div>

            <!-- PUBG Style Rank Progress Bar -->
            <div class="space-y-1.5">
              <div class="w-full bg-slate-800/80 rounded-full h-2.5 overflow-hidden border border-white/10">
                <div 
                  class="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-amber-400 rounded-full transition-all duration-700 shadow-xs"
                  style="width: ${tierData.progressPercent}%"
                ></div>
              </div>
              <div class="flex items-center justify-between text-[11px] text-slate-300 font-medium">
                <span class="truncate mr-2">${progressText}</span>
                <span class="font-bold text-white font-mono flex-shrink-0">${tierData.progressPercent}%</span>
              </div>
            </div>

          </div>

        </div>
      </div>
    `;
  }

  getPassBadge(tierStr) {
    const t = String(tierStr || 'free').toLowerCase();
    if (t === 'elite') return '<span class="inline-block px-1.5 py-0.5 rounded text-[9px] font-black bg-purple-100 text-purple-800 border border-purple-200 uppercase">Elite</span>';
    if (t === 'plus') return '<span class="inline-block px-1.5 py-0.5 rounded text-[9px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200 uppercase">Plus</span>';
    if (t === 'core') return '<span class="inline-block px-1.5 py-0.5 rounded text-[9px] font-black bg-blue-100 text-blue-800 border border-blue-200 uppercase">Core</span>';
    return '<span class="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200 uppercase">Free</span>';
  }

  // ==========================================
  // 7. TOP 3 PODIUM (BASED ON CURRENT FILTER)
  // ==========================================
  renderPodium(top3, currentUser) {
    if (top3.length < 3) return '';

    const first = top3[0];
    const second = top3[1];
    const third = top3[2];

    const isCurrentFirst = currentUser && currentUser.id === first.id;
    const isCurrentSecond = currentUser && currentUser.id === second.id;
    const isCurrentThird = currentUser && currentUser.id === third.id;

    return `
      <div class="bg-gradient-to-b from-slate-50 to-white border border-slate-200 rounded-2xl p-3.5 sm:p-8 shadow-sm">
        <div class="text-center mb-4 sm:mb-6">
          <span class="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-indigo-600 block">Season Elite</span>
          <h2 class="text-lg sm:text-xl font-bold text-slate-900">Hall of Champions</h2>
          <p class="text-[11px] sm:text-xs text-slate-500 mt-0.5">Top performing candidates in current view ranked by verified XP</p>
        </div>

        <div class="grid grid-cols-3 gap-1.5 sm:gap-6 items-end max-w-3xl mx-auto pt-6 sm:pt-8 pb-3 sm:pb-4">
          
          <!-- #2 SILVER (LEFT) -->
          <div class="flex flex-col items-center text-center order-1">
            <div class="relative mb-1.5 sm:mb-2">
              <div class="w-12 h-12 sm:w-20 sm:h-20 rounded-full p-0.5 sm:p-1 bg-gradient-to-b from-slate-300 via-slate-100 to-slate-400 shadow-md">
                <img 
                  src="${second.avatar}" 
                  alt="${second.name}" 
                  class="w-full h-full rounded-full object-cover border sm:border-2 border-white"
                >
              </div>
              <div class="absolute -bottom-1.5 sm:-bottom-2 left-1/2 -translate-x-1/2 bg-slate-700 text-white text-[10px] sm:text-[11px] font-black w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center border sm:border-2 border-white shadow-sm font-mono">
                2
              </div>
            </div>
            
            <div class="mt-1 sm:mt-2 w-full px-0.5">
              <span class="text-[11px] sm:text-sm font-black text-slate-800 truncate block ${isCurrentSecond ? 'text-blue-600' : ''}">
                ${second.name} ${isCurrentSecond ? '(You)' : ''}
              </span>
              <div class="flex items-center justify-center gap-1 mt-0.5 flex-wrap">
                ${this.getTierBadgeSvg(second.tier, 16)}
                <span class="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase truncate">${second.tier.name}</span>
                ${this.getPassBadge(second.subscriptionTier)}
              </div>
              <span class="text-[11px] sm:text-xs font-black text-slate-700 font-mono mt-0.5 sm:mt-1 block">
                ${second.totalXp.toLocaleString()} XP
              </span>
            </div>

            <!-- Silver Pedestal -->
            <div class="w-full h-16 sm:h-32 bg-gradient-to-t from-slate-200 to-slate-100 rounded-t-xl sm:rounded-t-2xl mt-3 sm:mt-4 border-t-2 sm:border-t-4 border-slate-300 flex items-center justify-center shadow-inner">
              <span class="text-xl sm:text-3xl font-black text-slate-400 font-mono">2nd</span>
            </div>
          </div>

          <!-- #1 GOLD (CENTER - ELEVATED) -->
          <div class="flex flex-col items-center text-center order-2 -mt-4 sm:-mt-6">
            <div class="relative mb-1.5 sm:mb-2">
              <div class="w-16 h-16 sm:w-24 sm:h-24 rounded-full p-1 sm:p-1.5 bg-gradient-to-b from-amber-300 via-yellow-200 to-amber-500 shadow-xl ring-2 sm:ring-4 ring-amber-400/20">
                <img 
                  src="${first.avatar}" 
                  alt="${first.name}" 
                  class="w-full h-full rounded-full object-cover border sm:border-2 border-white"
                >
              </div>
              <!-- Crown icon -->
              <div class="absolute -top-3 sm:-top-4 left-1/2 -translate-x-1/2 bg-amber-400 text-amber-950 p-0.5 sm:p-1 rounded-full shadow-md">
                <i data-lucide="crown" class="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-amber-950"></i>
              </div>
              <div class="absolute -bottom-2 sm:-bottom-2.5 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-[11px] sm:text-xs font-black w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center border sm:border-2 border-white shadow-md font-mono">
                1
              </div>
            </div>

            <div class="mt-1 sm:mt-2 w-full px-0.5">
              <span class="text-[11px] sm:text-sm font-black text-slate-900 truncate block ${isCurrentFirst ? 'text-blue-600' : ''}">
                ${first.name} ${isCurrentFirst ? '(You)' : ''}
              </span>
              <div class="flex items-center justify-center gap-1 mt-0.5 flex-wrap">
                ${this.getTierBadgeSvg(first.tier, 18)}
                <span class="text-[10px] sm:text-[11px] font-extrabold text-amber-600 uppercase truncate">${first.tier.name}</span>
                ${this.getPassBadge(first.subscriptionTier)}
              </div>
              <span class="text-xs sm:text-sm font-black text-amber-600 font-mono mt-0.5 sm:mt-1 block">
                ${first.totalXp.toLocaleString()} XP
              </span>
            </div>

            <!-- Gold Pedestal -->
            <div class="w-full h-24 sm:h-44 bg-gradient-to-t from-amber-200/80 via-amber-100 to-yellow-50 rounded-t-xl sm:rounded-t-2xl mt-3 sm:mt-4 border-t-2 sm:border-t-4 border-amber-400 flex flex-col items-center justify-center shadow-inner">
              <span class="text-2xl sm:text-4xl font-black text-amber-500/80 font-mono">1st</span>
              <span class="text-[9px] sm:text-[10px] font-black tracking-widest uppercase text-amber-700/80 mt-0.5 sm:mt-1">Champion</span>
            </div>
          </div>

          <!-- #3 BRONZE (RIGHT) -->
          <div class="flex flex-col items-center text-center order-3">
            <div class="relative mb-1.5 sm:mb-2">
              <div class="w-12 h-12 sm:w-20 sm:h-20 rounded-full p-0.5 sm:p-1 bg-gradient-to-b from-amber-700 via-amber-600 to-amber-900 shadow-md">
                <img 
                  src="${third.avatar}" 
                  alt="${third.name}" 
                  class="w-full h-full rounded-full object-cover border sm:border-2 border-white"
                >
              </div>
              <div class="absolute -bottom-1.5 sm:-bottom-2 left-1/2 -translate-x-1/2 bg-amber-800 text-white text-[10px] sm:text-[11px] font-black w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center border sm:border-2 border-white shadow-sm font-mono">
                3
              </div>
            </div>

            <div class="mt-1 sm:mt-2 w-full px-0.5">
              <span class="text-[11px] sm:text-sm font-black text-slate-800 truncate block ${isCurrentThird ? 'text-blue-600' : ''}">
                ${third.name} ${isCurrentThird ? '(You)' : ''}
              </span>
              <div class="flex items-center justify-center gap-1 mt-0.5 flex-wrap">
                ${this.getTierBadgeSvg(third.tier, 16)}
                <span class="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase truncate">${third.tier.name}</span>
                ${this.getPassBadge(third.subscriptionTier)}
              </div>
              <span class="text-[11px] sm:text-xs font-black text-slate-700 font-mono mt-0.5 sm:mt-1 block">
                ${third.totalXp.toLocaleString()} XP
              </span>
            </div>

            <!-- Bronze Pedestal -->
            <div class="w-full h-14 sm:h-28 bg-gradient-to-t from-orange-200/60 to-orange-100/50 rounded-t-xl sm:rounded-t-2xl mt-3 sm:mt-4 border-t-2 sm:border-t-4 border-amber-700 flex items-center justify-center shadow-inner">
              <span class="text-xl sm:text-3xl font-black text-amber-800/60 font-mono">3rd</span>
            </div>
          </div>

        </div>
      </div>
    `;
  }

  // =========================================================================
  // 8. MULTI-FACETED CONTROLS & 6-WAY FILTER BAR (NO STUDENT COUNT EXPOSURE)
  // =========================================================================
  renderFilterBar(examLevels, subjects, cities) {
    const tierFamilies = [
      'All Ranks',
      'Rookie',
      'Scholar',
      'Achiever',
      'Elite',
      'Master',
      'Apex',
      'Titan',
      'Legend',
      'Sovereign'
    ];

    const allStatesList = Object.keys(INDIA_STATES_AND_DISTRICTS).sort();
    
    // Available districts based on selected state
    let availableDistricts = [];
    if (this.selectedStateFilter !== 'all' && INDIA_STATES_AND_DISTRICTS[this.selectedStateFilter]) {
      availableDistricts = INDIA_STATES_AND_DISTRICTS[this.selectedStateFilter].slice().sort();
    }

    const stateDisplay = this.selectedStateFilter === 'all' ? 'All States' : this.selectedStateFilter;
    const districtDisplay = this.selectedDistrictFilter === 'all' ? 'All Districts' : this.selectedDistrictFilter;

    // Filter states by stateSearchText
    const filteredStates = allStatesList.filter(s => 
      !this.stateSearchText || s.toLowerCase().includes(this.stateSearchText.toLowerCase())
    );

    // Filter districts by districtSearchText
    const filteredDistricts = availableDistricts.filter(d => 
      !this.districtSearchText || d.toLowerCase().includes(this.districtSearchText.toLowerCase())
    );

    const isAnyFilterActive = this.selectedRankFilter !== 'all' || 
                             this.selectedExamLevelFilter !== 'all' || 
                             this.selectedSubjectFilter !== 'all' || 
                             this.selectedStateFilter !== 'all' || 
                             this.selectedDistrictFilter !== 'all' || 
                             this.selectedCityFilter !== 'all' || 
                             !!this.searchQuery;

    return `
      <div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        
        <!-- ROW 1: SEARCH STUDENT (STRICT PRIVACY: NO STUDENT COUNTS DISPLAYED) -->
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div class="relative flex-1">
            <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"></i>
            <input 
              type="text" 
              id="leaderboard-search-input"
              placeholder="Search student by name..." 
              value="${this.searchQuery}"
              oninput="window.leaderboardManager.handleSearch(this.value)"
              class="w-full pl-10 pr-4 py-2.5 text-xs font-medium border border-slate-200 rounded-xl bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            >
          </div>

          <!-- CLEAR FILTERS BUTTON -->
          <button 
            onclick="window.leaderboardManager.resetFilters()"
            class="px-4 py-2.5 border border-slate-200 hover:border-rose-300 bg-slate-50 hover:bg-rose-50 text-slate-700 hover:text-rose-700 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
            title="Reset all filters to default"
          >
            <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i> CLEAR FILTERS
          </button>
        </div>

        <!-- ROW 2: SIX NEATLY ARRANGED FILTERS (RANK, EXAM LEVEL, SUBJECT, STATE, DISTRICT, CITY) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-2 border-t border-slate-100">
          
          <!-- 1. Rank Filter -->
          <div>
            <label class="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Rank</label>
            <select 
              id="lb-rank-filter"
              onchange="window.leaderboardManager.handleRankFilterChange(this.value)"
              class="w-full px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl bg-slate-50 hover:bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-colors"
            >
              ${tierFamilies.map(fam => {
                const val = fam === 'All Ranks' ? 'all' : fam;
                const isSel = this.selectedRankFilter.toLowerCase() === val.toLowerCase();
                return `<option value="${val}" ${isSel ? 'selected' : ''}>${fam}</option>`;
              }).join('')}
            </select>
          </div>

          <!-- 2. Exam Level Filter -->
          <div>
            <label class="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Exam Level</label>
            <select 
              id="lb-examlevel-filter"
              onchange="window.leaderboardManager.handleExamLevelFilterChange(this.value)"
              class="w-full px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl bg-slate-50 hover:bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-colors"
            >
              <option value="all" ${this.selectedExamLevelFilter === 'all' ? 'selected' : ''}>All Levels</option>
              ${examLevels.map(lvl => `
                <option value="${lvl}" ${this.selectedExamLevelFilter.toLowerCase() === lvl.toLowerCase() ? 'selected' : ''}>${lvl}</option>
              `).join('')}
            </select>
          </div>

          <!-- 3. Subject Filter -->
          <div>
            <label class="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Subject</label>
            <select 
              id="lb-subject-filter"
              onchange="window.leaderboardManager.handleSubjectFilterChange(this.value)"
              class="w-full px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl bg-slate-50 hover:bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-colors"
            >
              <option value="all" ${this.selectedSubjectFilter === 'all' ? 'selected' : ''}>All Subjects</option>
              ${subjects.map(sb => `
                <option value="${sb.name}" ${this.selectedSubjectFilter.toLowerCase() === sb.name.toLowerCase() ? 'selected' : ''}>${sb.name}</option>
              `).join('')}
            </select>
          </div>

          <!-- 4. State Filter (SEARCHABLE COMBOBOX WITH ALL 28 STATES + 8 UTs) -->
          <div class="relative" id="lb-state-combobox-container">
            <label class="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">State</label>
            <div class="relative">
              <input 
                id="lb-state-search-input"
                type="text" 
                placeholder="Search state..."
                value="${this.stateSearchText || (this.selectedStateFilter !== 'all' ? this.selectedStateFilter : '')}"
                onclick="window.leaderboardManager.openStateDropdown()"
                onfocus="window.leaderboardManager.openStateDropdown()"
                oninput="window.leaderboardManager.handleStateSearchInput(this.value)"
                class="w-full pl-3 pr-8 py-2 text-xs font-bold border border-slate-200 rounded-xl bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              >
              <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-slate-400 pointer-events-none">
                <i data-lucide="chevron-down" class="w-3.5 h-3.5"></i>
              </div>
            </div>

            <!-- State Dropdown List -->
            <div 
              id="lb-state-dropdown-menu"
              class="${this.stateDropdownOpen ? 'block' : 'hidden'} absolute left-0 top-full mt-1 w-full sm:w-64 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1 text-xs"
            >
              <div 
                onclick="window.leaderboardManager.selectState('all')"
                class="px-3 py-2 hover:bg-blue-50 cursor-pointer font-bold ${this.selectedStateFilter === 'all' ? 'text-blue-600 bg-blue-50/50' : 'text-slate-700'}"
              >
                All States (Reset)
              </div>
              <div class="border-t border-slate-100 my-1"></div>
              ${filteredStates.length === 0 ? `
                <div class="px-3 py-2 text-slate-400 italic">No states found</div>
              ` : filteredStates.map(st => `
                <div 
                  onclick="window.leaderboardManager.selectState('${st.replace(/'/g, "\\'")}')"
                  class="px-3 py-2 hover:bg-blue-50 cursor-pointer font-medium ${this.selectedStateFilter.toLowerCase() === st.toLowerCase() ? 'text-blue-600 font-bold bg-blue-50' : 'text-slate-800'}"
                >
                  ${st}
                </div>
              `).join('')}
            </div>
          </div>

          <!-- 5. District Filter (SEARCHABLE & DYNAMICALLY DEPENDENT ON STATE) -->
          <div class="relative" id="lb-district-combobox-container">
            <label class="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">District</label>
            <div class="relative">
              <input 
                id="lb-district-search-input"
                type="text" 
                placeholder="${this.selectedStateFilter === 'all' ? 'Select state first' : 'Search district...'}"
                value="${this.districtSearchText || (this.selectedDistrictFilter !== 'all' ? this.selectedDistrictFilter : '')}"
                onclick="window.leaderboardManager.openDistrictDropdown()"
                onfocus="window.leaderboardManager.openDistrictDropdown()"
                oninput="window.leaderboardManager.handleDistrictSearchInput(this.value)"
                ${this.selectedStateFilter === 'all' ? 'disabled' : ''}
                class="w-full pl-3 pr-8 py-2 text-xs font-bold border border-slate-200 rounded-xl bg-slate-50 hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
              <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-slate-400 pointer-events-none">
                <i data-lucide="chevron-down" class="w-3.5 h-3.5"></i>
              </div>
            </div>

            <!-- District Dropdown List -->
            <div 
              id="lb-district-dropdown-menu"
              class="${this.districtDropdownOpen ? 'block' : 'hidden'} absolute left-0 top-full mt-1 w-full sm:w-64 max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1 text-xs"
            >
              <div 
                onclick="window.leaderboardManager.selectDistrict('all')"
                class="px-3 py-2 hover:bg-blue-50 cursor-pointer font-bold ${this.selectedDistrictFilter === 'all' ? 'text-blue-600 bg-blue-50/50' : 'text-slate-700'}"
              >
                All Districts
              </div>
              <div class="border-t border-slate-100 my-1"></div>
              ${filteredDistricts.length === 0 ? `
                <div class="px-3 py-2 text-slate-400 italic">No districts found</div>
              ` : filteredDistricts.map(dt => `
                <div 
                  onclick="window.leaderboardManager.selectDistrict('${dt.replace(/'/g, "\\'")}')"
                  class="px-3 py-2 hover:bg-blue-50 cursor-pointer font-medium ${this.selectedDistrictFilter.toLowerCase() === dt.toLowerCase() ? 'text-blue-600 font-bold bg-blue-50' : 'text-slate-800'}"
                >
                  ${dt}
                </div>
              `).join('')}
            </div>
          </div>

          <!-- 6. City Filter -->
          <div>
            <label class="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">City</label>
            <select 
              id="lb-city-filter"
              onchange="window.leaderboardManager.handleCityFilterChange(this.value)"
              class="w-full px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl bg-slate-50 hover:bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-colors"
            >
              <option value="all" ${this.selectedCityFilter === 'all' ? 'selected' : ''}>All Cities</option>
              ${cities.map(ct => `
                <option value="${ct}" ${this.selectedCityFilter.toLowerCase() === ct.toLowerCase() ? 'selected' : ''}>${ct}</option>
              `).join('')}
            </select>
          </div>

        </div>

        <!-- ACTIVE FILTER CHIPS -->
        ${isAnyFilterActive ? `
          <div class="pt-3 border-t border-slate-100 flex items-center justify-between text-xs flex-wrap gap-2">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-slate-400 font-medium mr-1">Active Filters:</span>
              ${this.selectedRankFilter !== 'all' ? `<span class="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold">Rank: ${this.selectedRankFilter}</span>` : ''}
              ${this.selectedExamLevelFilter !== 'all' ? `<span class="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-bold">Level: ${this.selectedExamLevelFilter}</span>` : ''}
              ${this.selectedSubjectFilter !== 'all' ? `<span class="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold">Subject: ${this.selectedSubjectFilter}</span>` : ''}
              ${this.selectedStateFilter !== 'all' ? `<span class="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-bold">State: ${this.selectedStateFilter}</span>` : ''}
              ${this.selectedDistrictFilter !== 'all' ? `<span class="px-2 py-0.5 rounded-md bg-cyan-100 text-cyan-800 font-bold">District: ${this.selectedDistrictFilter}</span>` : ''}
              ${this.selectedCityFilter !== 'all' ? `<span class="px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 font-bold">City: ${this.selectedCityFilter}</span>` : ''}
              ${this.searchQuery ? `<span class="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold">Name: "${this.searchQuery}"</span>` : ''}
            </div>
            <button 
              onclick="window.leaderboardManager.resetFilters()"
              class="text-rose-600 hover:text-rose-800 font-bold text-xs hover:underline cursor-pointer"
            >
              Reset All
            </button>
          </div>
        ` : ''}

      </div>
    `;
  }

  // ==========================================
  // COMBOBOX INTERACTIONS FOR STATE & DISTRICT
  // ==========================================
  openStateDropdown() {
    this.stateDropdownOpen = true;
    this.districtDropdownOpen = false;
    this.renderDropdownMenus();
  }

  closeStateDropdown() {
    this.stateDropdownOpen = false;
    this.renderDropdownMenus();
  }

  handleStateSearchInput(val) {
    this.stateSearchText = val;
    this.stateDropdownOpen = true;
    this.renderDropdownMenus();
  }

  selectState(stateName) {
    this.selectedStateFilter = stateName;
    this.stateSearchText = stateName === 'all' ? '' : stateName;
    this.stateDropdownOpen = false;
    // Reset district and city when state changes
    this.selectedDistrictFilter = 'all';
    this.districtSearchText = '';
    this.selectedCityFilter = 'all';
    this.currentPage = 1;
    this.render();
  }

  openDistrictDropdown() {
    if (this.selectedStateFilter === 'all') return;
    this.districtDropdownOpen = true;
    this.stateDropdownOpen = false;
    this.renderDropdownMenus();
  }

  closeDistrictDropdown() {
    this.districtDropdownOpen = false;
    this.renderDropdownMenus();
  }

  handleDistrictSearchInput(val) {
    this.districtSearchText = val;
    this.districtDropdownOpen = true;
    this.renderDropdownMenus();
  }

  selectDistrict(districtName) {
    this.selectedDistrictFilter = districtName;
    this.districtSearchText = districtName === 'all' ? '' : districtName;
    this.districtDropdownOpen = false;
    this.selectedCityFilter = 'all';
    this.currentPage = 1;
    this.render();
  }

  renderDropdownMenus() {
    const sMenu = document.getElementById('lb-state-dropdown-menu');
    if (sMenu) {
      if (this.stateDropdownOpen) {
        sMenu.classList.remove('hidden');
        sMenu.classList.add('block');
        // Update content of state dropdown
        const allStatesList = Object.keys(INDIA_STATES_AND_DISTRICTS).sort();
        const filteredStates = allStatesList.filter(s => 
          !this.stateSearchText || s.toLowerCase().includes(this.stateSearchText.toLowerCase())
        );
        sMenu.innerHTML = `
          <div 
            onclick="window.leaderboardManager.selectState('all')"
            class="px-3 py-2 hover:bg-blue-50 cursor-pointer font-bold ${this.selectedStateFilter === 'all' ? 'text-blue-600 bg-blue-50/50' : 'text-slate-700'}"
          >
            All States (Reset)
          </div>
          <div class="border-t border-slate-100 my-1"></div>
          ${filteredStates.length === 0 ? `
            <div class="px-3 py-2 text-slate-400 italic">No states found</div>
          ` : filteredStates.map(st => `
            <div 
              onclick="window.leaderboardManager.selectState('${st.replace(/'/g, "\\'")}')"
              class="px-3 py-2 hover:bg-blue-50 cursor-pointer font-medium ${this.selectedStateFilter.toLowerCase() === st.toLowerCase() ? 'text-blue-600 font-bold bg-blue-50' : 'text-slate-800'}"
            >
              ${st}
            </div>
          `).join('')}
        `;
      } else {
        sMenu.classList.remove('block');
        sMenu.classList.add('hidden');
      }
    }

    const dMenu = document.getElementById('lb-district-dropdown-menu');
    if (dMenu) {
      if (this.districtDropdownOpen && this.selectedStateFilter !== 'all') {
        dMenu.classList.remove('hidden');
        dMenu.classList.add('block');
        const availableDistricts = (INDIA_STATES_AND_DISTRICTS[this.selectedStateFilter] || []).slice().sort();
        const filteredDistricts = availableDistricts.filter(d => 
          !this.districtSearchText || d.toLowerCase().includes(this.districtSearchText.toLowerCase())
        );
        dMenu.innerHTML = `
          <div 
            onclick="window.leaderboardManager.selectDistrict('all')"
            class="px-3 py-2 hover:bg-blue-50 cursor-pointer font-bold ${this.selectedDistrictFilter === 'all' ? 'text-blue-600 bg-blue-50/50' : 'text-slate-700'}"
          >
            All Districts
          </div>
          <div class="border-t border-slate-100 my-1"></div>
          ${filteredDistricts.length === 0 ? `
            <div class="px-3 py-2 text-slate-400 italic">No districts found</div>
          ` : filteredDistricts.map(dt => `
            <div 
              onclick="window.leaderboardManager.selectDistrict('${dt.replace(/'/g, "\\'")}')"
              class="px-3 py-2 hover:bg-blue-50 cursor-pointer font-medium ${this.selectedDistrictFilter.toLowerCase() === dt.toLowerCase() ? 'text-blue-600 font-bold bg-blue-50' : 'text-slate-800'}"
            >
              ${dt}
            </div>
          `).join('')}
        `;
      } else {
        dMenu.classList.remove('block');
        dMenu.classList.add('hidden');
      }
    }
  }

  // ==========================================
  // 9. LEADERBOARD TABLE & RESPONSIVE CARDS
  // ==========================================
  renderTable(studentsList, sliceOffset = 0, currentUser = null) {
    const fullList = sliceOffset > 0 ? studentsList.slice(sliceOffset) : studentsList;

    if (fullList.length === 0) {
      return `
        <div class="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <i data-lucide="filter" class="w-10 h-10 text-slate-300 mx-auto mb-3"></i>
          <h3 class="text-sm font-bold text-slate-800">No students found matching your filters</h3>
          <p class="text-xs text-slate-400 mt-1">Try selecting a different rank, exam level, subject, state, or clearing your search term.</p>
          <button 
            onclick="window.leaderboardManager.resetFilters()"
            class="mt-4 px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl hover:bg-blue-700 transition-colors cursor-pointer"
          >
            Clear All Filters
          </button>
        </div>
      `;
    }

    const totalPages = Math.max(1, Math.ceil(fullList.length / this.pageSize));
    if (this.currentPage > totalPages) this.currentPage = totalPages;
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const pagedList = fullList.slice(startIndex, startIndex + this.pageSize);

    // Pagination controls HTML
    let paginationHtml = '';
    if (totalPages > 1) {
      let pageBtns = [];
      for (let p = 1; p <= totalPages; p++) {
        pageBtns.push(`
          <button 
            type="button"
            onclick="window.leaderboardManager.goToPage(${p})"
            class="w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              this.currentPage === p 
                ? 'bg-blue-600 text-white shadow-xs' 
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }"
          >
            ${p}
          </button>
        `);
      }

      paginationHtml = `
        <div class="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="text-xs text-slate-500 font-medium">
            Showing <strong>${startIndex + 1}</strong> - <strong>${Math.min(startIndex + this.pageSize, fullList.length)}</strong> of <strong>${fullList.length}</strong> Students
          </div>
          <div class="flex items-center gap-1.5">
            <button 
              type="button"
              onclick="window.leaderboardManager.goToPage(${this.currentPage - 1})"
              ${this.currentPage === 1 ? 'disabled' : ''}
              class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Previous
            </button>
            ${pageBtns.join('')}
            <button 
              type="button"
              onclick="window.leaderboardManager.goToPage(${this.currentPage + 1})"
              ${this.currentPage === totalPages ? 'disabled' : ''}
              class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div id="lb-table-container" class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        
        <!-- Table view for desktop / tablet -->
        <div class="hidden sm:block overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <th class="py-3.5 px-5 w-24 text-center">RANK</th>
                <th class="py-3.5 px-5">STUDENT</th>
                <th class="py-3.5 px-5">TIER</th>
                <th class="py-3.5 px-5 text-right">XP</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${pagedList.map(st => {
                const isCurrentUser = currentUser && currentUser.id === st.id;
                const movement = this.renderRankMovement(st);
                const tierBadge = this.getTierBadgeSvg(st.tier, 24);

                return `
                  <tr 
                    id="student-row-${st.id}"
                    class="${isCurrentUser ? 'bg-blue-50/90 font-medium' : 'hover:bg-slate-50'} transition-colors"
                  >
                    <!-- Sequential Context Rank & Movement -->
                    <td class="py-4 px-5 text-center whitespace-nowrap">
                      <div class="flex items-center justify-center gap-1.5 font-mono">
                        <span class="font-extrabold text-sm ${st.contextRank <= 3 ? 'text-amber-600' : 'text-slate-800'}">
                          #${st.contextRank}
                        </span>
                        ${movement}
                      </div>
                    </td>

                    <!-- Student Info -->
                    <td class="py-4 px-5">
                      <div class="flex items-center gap-3">
                        <img 
                          src="${st.avatar}" 
                          alt="${st.name}" 
                          class="w-10 h-10 rounded-full object-cover border border-slate-200 flex-shrink-0"
                        >
                        <div>
                          <div class="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                            ${st.name}
                            ${this.getPassBadge(st.subscriptionTier)}
                            ${isCurrentUser ? '<span class="text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded">You</span>' : ''}
                          </div>
                          
                          <!-- Location & Level Chips -->
                          <div class="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                            <span>${st.district ? `${st.district}, ` : ''}${st.state}</span>
                            <span>•</span>
                            <span class="font-medium text-slate-600">${st.caLevel}</span>
                          </div>

                          <!-- Achievement Badges -->
                          ${st.achievementBadges && st.achievementBadges.length > 0 ? `
                            <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              ${st.achievementBadges.map(ach => `
                                <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                  ★ ${ach}
                                </span>
                              `).join('')}
                            </div>
                          ` : ''}
                        </div>
                      </div>
                    </td>

                    <!-- Gaming Tier -->
                    <td class="py-4 px-5 whitespace-nowrap">
                      <div class="flex items-center gap-2">
                        ${tierBadge}
                        <div>
                          <span class="text-xs font-black text-slate-900 uppercase tracking-wide block">${st.tier.name}</span>
                          <span class="text-[10px] text-slate-400">${st.tier.family} Tier</span>
                        </div>
                      </div>
                    </td>

                    <!-- Context XP Score -->
                    <td class="py-4 px-5 text-right whitespace-nowrap">
                      <span class="text-sm font-black text-slate-900 font-mono block">${st.totalXp.toLocaleString()} XP</span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Mobile card list (sm:hidden) -->
        <div class="sm:hidden divide-y divide-slate-100">
          ${pagedList.map(st => {
            const isCurrentUser = currentUser && currentUser.id === st.id;
            const movement = this.renderRankMovement(st);
            const tierBadge = this.getTierBadgeSvg(st.tier, 24);

            return `
              <div 
                id="student-card-${st.id}"
                class="p-4 ${isCurrentUser ? 'bg-blue-50/90' : 'bg-white'} flex items-center justify-between gap-3"
              >
                <div class="flex items-center gap-3">
                  <div class="text-center font-mono w-8">
                    <span class="font-extrabold text-sm ${st.contextRank <= 3 ? 'text-amber-600' : 'text-slate-800'}">
                      #${st.contextRank}
                    </span>
                    <div class="flex justify-center mt-0.5">${movement}</div>
                  </div>

                  <img 
                    src="${st.avatar}" 
                    alt="${st.name}" 
                    class="w-10 h-10 rounded-full object-cover border border-slate-200 flex-shrink-0"
                  >

                  <div>
                    <div class="font-extrabold text-slate-900 text-xs flex items-center gap-1.5 flex-wrap">
                      ${st.name}
                      ${this.getPassBadge(st.subscriptionTier)}
                      ${isCurrentUser ? '<span class="text-[9px] font-black uppercase text-blue-700 bg-blue-100 px-1 rounded">You</span>' : ''}
                    </div>
                    <div class="text-[10px] text-slate-400 mt-0.5">
                      ${st.district ? `${st.district}, ` : ''}${st.state} • ${st.caLevel}
                    </div>
                    <div class="flex items-center gap-1 mt-1">
                      ${tierBadge}
                      <span class="text-[10px] font-extrabold text-slate-700 uppercase">${st.tier.name}</span>
                    </div>
                  </div>
                </div>

                <div class="text-right">
                  <span class="text-xs font-black text-slate-900 font-mono block">${st.totalXp.toLocaleString()} XP</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Pagination Bar -->
        ${paginationHtml}

      </div>
    `;
  }

  // ==========================================
  // 10. RANK MOVEMENT INDICATOR
  // ==========================================
  renderRankMovement(student) {
    if (!student.previousRank || student.previousRank === student.contextRank) {
      return `<span class="text-[10px] font-bold text-slate-400 select-none">—</span>`;
    }

    const diff = student.previousRank - student.contextRank;
    if (diff > 0) {
      return `
        <span class="text-[10px] font-extrabold text-emerald-600 flex items-center gap-0.5 select-none" title="Moved up ${diff} positions">
          <span class="text-[9px]">▲</span>${diff}
        </span>
      `;
    } else {
      const down = Math.abs(diff);
      return `
        <span class="text-[10px] font-extrabold text-rose-500 flex items-center gap-0.5 select-none" title="Moved down ${down} positions">
          <span class="text-[9px]">▼</span>${down}
        </span>
      `;
    }
  }

  // ==========================================
  // 11. STICKY "YOUR POSITION" FLOATING CARD
  // ==========================================
  renderStickyYourPosition(student) {
    return `
      <div 
        id="leaderboard-sticky-position"
        class="fixed bottom-3 sm:bottom-6 left-3 sm:left-auto right-3 sm:right-6 z-40 bg-slate-900/95 text-white border border-slate-700 shadow-2xl rounded-2xl p-3 sm:p-4 flex items-center gap-2.5 sm:gap-4 transition-all hover:border-blue-500/80 backdrop-blur-md"
      >
        <div class="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-xs font-mono flex-shrink-0">
            #${student.contextRank}
          </div>
          <div class="min-w-0">
            <span class="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Your Position</span>
            <div class="flex items-center gap-1.5 sm:gap-2">
              <span class="text-[11px] sm:text-xs font-black text-amber-300 uppercase truncate">${student.tier.name}</span>
              <span class="text-[11px] sm:text-xs font-bold text-emerald-400 font-mono flex-shrink-0">${student.totalXp.toLocaleString()} XP</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================
  // 12. RANK-UP CELEBRATION MODAL
  // ==========================================
  checkRankUp(studentStanding) {
    const key = `excellenceca_last_tier_${studentStanding.id}`;
    const lastTierId = localStorage.getItem(key);

    if (lastTierId && lastTierId !== studentStanding.tier.id) {
      const allTiers = window.store ? window.store.getRankTiers() : [];
      const oldTier = allTiers.find(t => t.id === lastTierId);
      const newTier = studentStanding.tier;

      const oldTierIdx = allTiers.findIndex(t => t.id === lastTierId);
      const newTierIdx = allTiers.findIndex(t => t.id === newTier.id);

      if (newTierIdx > oldTierIdx) {
        this.showRankUpModal(oldTier || { name: 'Previous Rank' }, newTier, studentStanding);
      }
    }

    localStorage.setItem(key, studentStanding.tier.id);
  }

  showRankUpModal(oldTier, newTier, student) {
    const modal = document.getElementById('rank-up-modal');
    if (!modal) return;

    const newBadgeSvg = this.getTierBadgeSvg(newTier, 80);

    modal.innerHTML = `
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
        <div class="bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-950 border border-amber-500/30 rounded-3xl p-8 max-w-md w-full text-center relative overflow-hidden shadow-2xl text-white">
          
          <div class="absolute -top-12 -left-12 w-48 h-48 bg-amber-500/20 rounded-full blur-3xl pointer-events-none"></div>
          <div class="absolute -bottom-12 -right-12 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl pointer-events-none"></div>

          <div class="relative z-10 space-y-5">
            
            <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <i data-lucide="sparkles" class="w-3.5 h-3.5"></i> TIER PROMOTION UNLOCKED
            </div>

            <div class="py-3 flex justify-center">
              <div class="p-4 rounded-3xl bg-white/5 border border-white/10 shadow-xl inline-block transform hover:scale-110 transition-transform">
                ${newBadgeSvg}
              </div>
            </div>

            <div>
              <span class="text-xs text-slate-400 font-bold uppercase tracking-wider block">Promoted from ${oldTier.name}</span>
              <h2 class="text-3xl font-black text-amber-400 tracking-tight mt-1 uppercase">${newTier.name}</h2>
              <p class="text-xs text-slate-300 mt-2 font-medium">
                Congratulations, <span class="font-bold text-white">${student.name}</span>! Your consistent problem solving has advanced your standing in the Competitive Season.
              </p>
            </div>

            <div class="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-around font-mono text-xs">
              <div>
                <span class="text-[10px] text-slate-400 uppercase block font-sans">Current Score</span>
                <span class="font-extrabold text-emerald-400 text-sm">${student.totalXp.toLocaleString()} XP</span>
              </div>
              <div class="w-px h-8 bg-white/10"></div>
              <div>
                <span class="text-[10px] text-slate-400 uppercase block font-sans">Context Rank</span>
                <span class="font-extrabold text-white text-sm">#${student.contextRank}</span>
              </div>
            </div>

            <button 
              onclick="window.leaderboardManager.closeRankUpModal()"
              class="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-transform hover:scale-[1.02] cursor-pointer"
            >
              Continue Learning
            </button>

          </div>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  closeRankUpModal() {
    const modal = document.getElementById('rank-up-modal');
    if (modal) modal.classList.add('hidden');
  }

  goToPage(page) {
    this.currentPage = page;
    this.render();
    const tbl = document.getElementById('lb-table-container');
    if (tbl) tbl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ==========================================
  // 13. FILTER EVENT HANDLERS
  // ==========================================
  handleRankFilterChange(value) {
    this.selectedRankFilter = value;
    this.currentPage = 1;
    this.render();
  }

  handleExamLevelFilterChange(value) {
    this.selectedExamLevelFilter = value;
    this.currentPage = 1;
    this.render();
  }

  handleSubjectFilterChange(value) {
    this.selectedSubjectFilter = value;
    this.currentPage = 1;
    this.render();
  }

  handleCityFilterChange(value) {
    this.selectedCityFilter = value;
    this.currentPage = 1;
    this.render();
  }

  handleSearch(query) {
    this.searchQuery = (query || '').trim();
    this.currentPage = 1;

    const resultsArea = document.getElementById('leaderboard-results-area');
    if (resultsArea) {
      // Fast sub-tree update: preserves search input element and user focus completely!
      const standings = this.cachedStandings && this.cachedStandings.length > 0 ? this.cachedStandings : this.calculateAllStandings();
      const currentUser = window.auth ? window.auth.getCurrentUser() : null;
      const filteredStandings = this.filterStandings(standings);
      filteredStandings.forEach((st, idx) => { st.contextRank = idx + 1; });
      const studentSelf = currentUser ? filteredStandings.find(s => s.id === currentUser.id) : null;

      resultsArea.innerHTML = this.renderResultsArea(filteredStandings, currentUser);

      const stickyArea = document.getElementById('leaderboard-sticky-area');
      if (stickyArea) {
        stickyArea.innerHTML = studentSelf ? this.renderStickyYourPosition(studentSelf) : '';
      }

      if (window.lucide) window.lucide.createIcons();
      return;
    }

    // Fallback: preserve selection & focus
    const input = document.getElementById('leaderboard-search-input');
    const start = input ? input.selectionStart : null;
    const end = input ? input.selectionEnd : null;

    this.render();

    if (start !== null) {
      const restored = document.getElementById('leaderboard-search-input');
      if (restored) {
        restored.focus();
        restored.setSelectionRange(start, end);
      }
    }
  }

  triggerRankUpIfEligible(userId, oldTotalXp, newTotalXp) {
    if (!userId || newTotalXp <= oldTotalXp) return;
    const rankTiers = window.store ? window.store.getRankTiers() : [];
    if (!rankTiers || rankTiers.length === 0) return;

    const oldTierData = this.resolveTier(oldTotalXp, rankTiers);
    const newTierData = this.resolveTier(newTotalXp, rankTiers);

    const oldTierIdx = rankTiers.findIndex(t => t.id === oldTierData.currentTier.id);
    const newTierIdx = rankTiers.findIndex(t => t.id === newTierData.currentTier.id);

    if (newTierIdx > oldTierIdx) {
      const key = `excellenceca_last_tier_${userId}`;
      const lastRecordedTierId = localStorage.getItem(key);
      const lastRecordedIdx = lastRecordedTierId ? rankTiers.findIndex(t => t.id === lastRecordedTierId) : oldTierIdx;

      if (newTierIdx > lastRecordedIdx) {
        const student = (this.cachedStandings && this.cachedStandings.find(s => s.id === userId)) || {
          id: userId,
          name: (window.auth && window.auth.getCurrentUser() && window.auth.getCurrentUser().id === userId) ? window.auth.getCurrentUser().name : 'Student',
          totalXp: newTotalXp,
          contextRank: this.getStudentRank(userId) || 1
        };
        student.totalXp = newTotalXp;
        student.contextRank = this.getStudentRank(userId) || student.contextRank || 1;
        this.showRankUpModal(oldTierData.currentTier, newTierData.currentTier, student);
        localStorage.setItem(key, newTierData.currentTier.id);
      }
    }
  }

  resetFilters() {
    this.selectedRankFilter = 'all';
    this.selectedExamLevelFilter = 'all';
    this.selectedSubjectFilter = 'all';
    this.selectedStateFilter = 'all';
    this.selectedDistrictFilter = 'all';
    this.selectedCityFilter = 'all';
    this.searchQuery = '';
    this.stateSearchText = '';
    this.districtSearchText = '';
    this.stateDropdownOpen = false;
    this.districtDropdownOpen = false;
    this.currentPage = 1;
    this.render();
  }
}

// Global Singleton
window.leaderboardManager = new LeaderboardManager();
