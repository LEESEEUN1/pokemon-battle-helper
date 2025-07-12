require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cors = require('cors');

// Firebase Admin SDK 초기화
// Vercel 배포 환경에서는 환경 변수에서 서비스 계정 키를 읽어오고,
// 로컬 환경에서는 파일에서 직접 읽어옵니다.
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require('./firebase-service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

// Gemini AI 클라이언트 초기화
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();
app.use(cors()); // CORS 미들웨어 추가
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('포켓몬 배틀 도우미 서버에 오신 것을 환영합니다!');
});

const db = admin.database();

// 내 포켓몬 목록 가져오기
app.get('/my-pokemons', async (req, res) => {
  try {
    const ref = db.ref('my-pokemons');
    const snapshot = await ref.once('value');
    const data = snapshot.val();
    res.status(200).json(data || []);
  } catch (error) {
    console.error('Error getting my pokemons:', error);
    res.status(500).send('내 포켓몬 목록을 가져오는 데 실패했습니다.');
  }
});

// 내 포켓몬 추가하기
app.post('/my-pokemons', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).send('포켓몬 이름이 필요합니다.');
    }
    const ref = db.ref('my-pokemons');
    await ref.push(name);
    res.status(201).send(`${name}을(를) 성공적으로 추가했습니다.`);
  } catch (error) {
    console.error('Error adding new pokemon:', error);
    res.status(500).send('새로운 포켓몬을 추가하는 데 실패했습니다.');
  }
});

// 야생 포켓몬 분석 및 배틀 추천
app.post('/battle-recommendation', async (req, res) => {
  try {
    const { wildPokemon } = req.body;
    if (!wildPokemon) {
      return res.status(400).send('야생 포켓몬 이름이 필요합니다.');
    }

    // 1. 내 포켓몬 목록 가져오기
    const myPokemonsRef = db.ref('my-pokemons');
    const snapshot = await myPokemonsRef.once('value');
    const myPokemonsData = snapshot.val();
    const myPokemonList = myPokemonsData ? Object.values(myPokemonsData) : [];

    if (myPokemonList.length === 0) {
        return res.status(400).send('내 포켓몬이 없습니다. 먼저 포켓몬을 추가해주세요.');
    }

    // 2. Gemini AI 프롬프트 생성
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const prompt = `
      당신은 닌텐도 포켓몬스터 실드 게임 전문가입니다.
      내가 현재 가진 포켓몬 목록은 다음과 같습니다: ${myPokemonList.join(', ')}.
      새롭게 만난 야생 포켓몬은 "${wildPokemon}"입니다.

      다음 형식에 맞춰 답변해주세요:

      ### 야생 포켓몬 분석 (${wildPokemon})
      *   **타입**: [예: 전기/비행]
      *   **주요 능력**: [예: 정전기, 혹은 게임상에서 유명한 능력]
      *   **상성 관계**: 
          *   유리한 타입: [예: 물, 비행]
          *   불리한 타입: [예: 땅]

      ### 배틀 추천
      *   **추천 포켓몬**: [내 포켓몬 중 가장 유리한 포켓몬 이름]
      *   **추천 이유**: [왜 그 포켓몬이 유리한지 간단한 설명]
    `;

    // 3. Gemini AI API 호출
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // 4. 결과 전송 (텍스트 형식으로)
    res.set('Content-Type', 'text/plain');
    res.status(200).send(text);

  } catch (error) {
    console.error('Error getting battle recommendation:', error);
    res.status(500).send('배틀 추천을 받는 데 실패했습니다.');
  }
});


app.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
