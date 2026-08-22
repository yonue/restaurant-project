const { User, Role } = require('../src/models');

async function main() {
  try {
    const users = await User.findAll({
      include: [{ model: Role, as: 'role' }]
    });
    console.log('--- Utilisateurs en Base de Données ---');
    users.forEach(u => {
      console.log(`- Email: ${u.email} | Nom: ${u.first_name} ${u.last_name} | Rôle: ${u.role ? u.role.name : 'Aucun'} (ID: ${u.role_id})`);
    });
  } catch (err) {
    console.error('Erreur:', err.message);
  }
  process.exit(0);
}

main();
