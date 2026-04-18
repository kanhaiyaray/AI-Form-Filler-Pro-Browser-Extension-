/**
 * fieldMap.js — Semantic Field Mapping Library
 * Layer 1 of 4-layer detection engine.
 * Exported as window.AIFF_FIELD_MAP for content script use.
 */

window.AIFF_FIELD_MAP = {
  // ── Personal ──────────────────────────────────────────────
  first_name:  ["first name","firstname","given name","fname","first","forename","prénom","nombre"],
  last_name:   ["last name","lastname","surname","family name","lname","last","apellido","nom"],
  full_name:   ["full name","fullname","name","your name","complete name","nombre completo","nom complet"],
  email:       ["email","email address","e-mail","mail","your email","work email","contact email","correo"],
  phone:       ["phone","phone number","mobile","mobile number","cell","contact number","tel","telephone","téléphone","móvil"],
  alt_phone:   ["alternate phone","secondary phone","other phone","phone 2"],
  dob:         ["date of birth","dob","birthdate","birth date","birthday","fecha de nacimiento","date de naissance"],
  gender:      ["gender","sex","sexo","genre"],
  nationality: ["nationality","citizenship","country of citizenship","nationalité"],
  id_number:   ["id number","national id","aadhaar","aadhar","passport number","ssn","national insurance"],

  // ── Address ───────────────────────────────────────────────
  address:     ["address","street address","address line 1","street","mailing address","dirección"],
  address2:    ["address line 2","apartment","apt","suite","unit","flat"],
  city:        ["city","town","ciudad","ville","locality"],
  state:       ["state","province","region","estado","région","county"],
  country:     ["country","nation","país","pays"],
  zip:         ["zip","zip code","postal code","pincode","pin code","postcode","código postal"],
  location:    ["location","current location","where are you","city state"],

  // ── Professional ──────────────────────────────────────────
  job_title:   ["job title","current role","position","designation","title","role","current job","puesto","poste"],
  experience:  ["years of experience","experience","work experience","total experience","yrs exp"],
  company:     ["company","current company","employer","organization","where do you work","empresa"],
  employment_type: ["employment type","job type","type of employment","work type"],
  skills:      ["skills","technical skills","technologies","tools","competencies","expertise","tech stack"],
  salary:      ["expected salary","salary expectation","desired salary","ctc","expected ctc","compensation","pay"],
  current_salary: ["current salary","current ctc","current compensation","present salary"],
  notice:      ["notice period","when can you join","joining date","available from","start date","notice"],
  summary:     ["professional summary","about me","profile summary","cover letter","tell us about yourself","bio","about you","summary","overview"],
  work_auth:   ["work authorization","authorization status","are you authorized","visa status","right to work"],
  remote:      ["work preference","work mode","remote","hybrid","onsite","work from home","wfh preference"],
  relocation:  ["willing to relocate","relocation","can you relocate"],

  // ── Education ─────────────────────────────────────────────
  degree:      ["degree","qualification","highest degree","education level","highest qualification"],
  field_study: ["field of study","specialization","major","subject","course","branch","stream"],
  university:  ["university","college","institute","school","institution","alma mater"],
  grad_year:   ["graduation year","passing year","year of graduation","batch","year of passing"],
  gpa:         ["gpa","cgpa","percentage","marks","grade","score","academic score"],

  // ── Links ─────────────────────────────────────────────────
  linkedin:    ["linkedin","linkedin profile","linkedin url","linkedin id"],
  github:      ["github","github profile","github url","github id","code repository"],
  portfolio:   ["portfolio","portfolio url","website","personal website","personal url","work samples"],
  resume:      ["resume","cv","upload resume","attach cv","resume link","portfolio link"],

  // ── Application ───────────────────────────────────────────
  cover_letter: ["cover letter","motivation letter","letter of intent","why do you want","why this role","why join"],
  references:   ["references","referees","reference contact"],
  languages:    ["languages","languages known","languages spoken","language skills"],
  certifications: ["certifications","certificates","licenses","credentials"],
  achievements: ["achievements","accomplishments","awards","honors"],
};
