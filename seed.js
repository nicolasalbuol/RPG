// Importa o ZIP inicial e cria as contas dos 6 agentes (dados lidos dos crachás fornecidos).
// Rode uma vez: node seed.js Documentos.zip
const fs = require('fs'), { importZip, db, mkUser, save, id } = require('./server.js');
const rep = importZip(fs.readFileSync(process.argv[2] || 'Documentos.zip')); console.log('novos:', rep.added.length, 'repetidos:', rep.dup.length, 'ignorados:', rep.skipped.length);
const A = [ // [nome, função, setor, matrícula, nível, trecho do nome do arquivo do crachá]
  ['Yuki Sangrois', 'Enfermagem', 'Setor 6', 'CP-4439', 'Nível 1', 'Enfermaria'],
  ['Měi Beifong', 'Nutrição', 'Setor 1', 'CP-4440', 'Nível 1', 'Nutrição'],
  ['Don Ramon', 'Recepção', 'Setor 5', 'CP-4443', 'Nível 1', 'Temporários do'],
  ['Lúcio Mark', 'Manutenção', 'Setor 3', 'CP-4444', 'Nível 2', 'corporativos'],
  ['Mei Ling', 'TI', 'Setor 4', 'CP-4441', 'Nível 2', 'Crachás do Centro'],
  ['Ayane Hanabi', 'Farmácia', 'Setor 2', 'CP-4442', 'Nível 1', 'hospitalares']];
const IDS = { 'lucio.mark': '804775643580989491', 'mei.ling': '601458945411776529', 'ayane.hanabi': '937806889004199997', 'don.ramon': '738077868889997402', 'mei.beifong': '1206661889279664199', 'yuki.sangrois': '1426038860638457857' };
let creds = fs.existsSync(require('path').join(process.env.HELIX_DATA || __dirname + '/data', 'CREDENCIAIS.txt')) ? fs.readFileSync(require('path').join(process.env.HELIX_DATA || __dirname + '/data', 'CREDENCIAIS.txt'), 'utf8') : '';
for (const [name, fn, setor, mat, nivel, key] of A) {
  const un = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '.');
  const d = db.docs.find(x => x.kind === 'badge' && x.orig.includes(key)), old = db.users.find(u => u.username === un);
  if (old) { if (d) old.badge = { front: d.id, back: d.id }; old.name = name; old.discordId = IDS[old.username]; continue; }
  const u = mkUser({ username: un, name, role: 'player', password: id(16), discordId: IDS[un], level: nivel,
    fields: { 'Função': fn, 'Setor': setor, 'Empresa': 'Cuidar Plus Serviços de Apoio Ltda.', 'Matrícula': mat, 'Validade': '72 horas a partir da admissão' },
    badge: { front: d && d.id, back: d && d.id } });
  db.users.push(u);
}
fs.writeFileSync(require('path').join(process.env.HELIX_DATA || __dirname + '/data', 'CREDENCIAIS.txt'), creds); save(); console.log(creds);
