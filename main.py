from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from pydantic import BaseModel
from datetime import datetime
from passlib.context import CryptContext

# CONFIGURAÇÃO DE SEGURANÇA PARA SENHAS
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SQLALCHEMY_DATABASE_URL = "sqlite:///./foundy.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ==========================================
# MODELOS DE TABELA
# ==========================================

class DBUsuario(Base):
    __tablename__ = "usuarios"
    
    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    cpf = Column(String, nullable=False)
    data_nascimento = Column(String, nullable=False)
    senha_hash = Column(String, nullable=False)
    telefone = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class DBItem(Base):
    __tablename__ = "itens"
    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String)
    categoria = Column(String)
    foto = Column(String)
    pergunta = Column(String)
    lat = Column(Float)
    lng = Column(Float)
    user_id = Column(Integer, ForeignKey("usuarios.id"))
    usuario_nome = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)

# ==========================================
# SCHEMAS DE VALIDAÇÃO (PYDANTIC)
# ==========================================

class UsuarioCreate(BaseModel):
    nome: str
    email: str
    cpf: str
    data_nascimento: str
    senha: str
    telefone: str

class UsuarioLogin(BaseModel):
    email: str
    senha: str

class ItemCreate(BaseModel):
    titulo: str
    categoria: str
    lat: float
    lng: float
    pergunta: str
    foto: str
    user_id: int
    usuario_nome: str

# ==========================================
# APP E ROTAS
# ==========================================

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- ROTAS DE AUTENTICAÇÃO ---

@app.post("/api/usuarios/registrar")
def registrar_usuario(user: UsuarioCreate, db: Session = Depends(get_db)):
    if db.query(DBUsuario).filter(DBUsuario.email == user.email).first():
        raise HTTPException(status_code=400, detail="E-mail já cadastrado.")
    
    senha_segura = pwd_context.hash(user.senha)
    
    novo_usuario = DBUsuario(
        nome=user.nome,
        email=user.email,
        cpf=user.cpf,
        data_nascimento=user.data_nascimento,
        senha_hash=senha_segura,
        telefone=user.telefone
    )
    db.add(novo_usuario)
    db.commit()
    return {"status": "Sucesso", "mensagem": "Usuário cadastrado!"}

@app.post("/api/usuarios/login")
def login_usuario(cred: UsuarioLogin, db: Session = Depends(get_db)):
    user = db.query(DBUsuario).filter(DBUsuario.email == cred.email).first()
    
    if not user or not pwd_context.verify(cred.senha, user.senha_hash):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")
    
    return {
        "id": user.id,
        "nome": user.nome,
        "email": user.email
    }

# --- ROTAS DE ITENS ---

@app.get("/api/itens")
def listar_itens(db: Session = Depends(get_db)):
    return db.query(DBItem).all()

@app.post("/api/itens")
def criar_item(item: ItemCreate, db: Session = Depends(get_db)):
    db_item = DBItem(**item.model_dump()) # Usando model_dump para evitar erros
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item