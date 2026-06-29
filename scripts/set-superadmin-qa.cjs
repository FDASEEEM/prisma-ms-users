const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const user = await p.user.update({
    where: { email: 'qa.test.259362@duocuc.cl' },
    data: { role: 'SUPERADMIN' },
  });
  console.log('Usuario actualizado:', user.email, '| Rol:', user.role);
  await p.$disconnect();
}
main().catch(e => { console.error('Error:', e.message); p.$disconnect(); });
