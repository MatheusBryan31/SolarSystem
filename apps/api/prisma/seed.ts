import { PrismaClient, Role } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const senha = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !senha || senha.length < 8) {
    throw new Error('Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD (mínimo 8 caracteres) no .env');
  }

  // upsert = "update or insert": cria se não existe; se existe, não mexe (update vazio)
  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: 'Administrador',
      email,
      passwordHash: await hash(senha, 12), // 12 = custo de bcrypt
      role: Role.ADMIN,
    },
  });

  console.log(`Administrador pronto: ${admin.email}`);
}

void main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
