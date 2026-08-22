import bcrypt from "bcrypt";

const password = "Younes123!";

const hash = await bcrypt.hash(password, 10);
console.log("Mot de passe :", password);
console.log("Hash :", hash);