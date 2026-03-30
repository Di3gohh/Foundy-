from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, Session, relationship
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from passlib.context import CryptContext
import base64
import os

# CONFIGURAÇÃO DE SEGURANÇA
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SQLALCHEMY_DATABASE_URL = "sqlite:///./foundy.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ==========================================
# MODELOS DE TABELA (SQLITE)
# ==========================================

class DBUsuario(Base):
    __tablename__ = "usuarios"
    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String)
    email = Column(String, unique=True, index=True)
    senha_hash = Column(String)
    cpf = Column(String)
    telefone = Column(String)
    data_nascimento = Column(String)
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
    user_id = Column(Integer, ForeignKey("usuarios.id")) # Relacionado ao ID do SQLite
    usuario_nome = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

class DBNotification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer)
    sender_name = Column(String)
    receiver_id = Column(Integer, ForeignKey("usuarios.id"))
    item_id = Column(Integer, ForeignKey("itens.id"))
    message = Column(String)
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)

# ==========================================
# SCHEMAS (VALIDAÇÃO)
# ==========================================

class UsuarioCreate(BaseModel):
    nome: str
    email: str
    senha: str
    cpf: str
    telefone: Optional[str] = None
    data_nascimento: str

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
# ROTAS DA API
# ==========================================

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

# --- AUTH ---
@app.post("/api/usuarios/registrar")
def registrar(user: UsuarioCreate, db: Session = Depends(get_db)):
    if db.query(DBUsuario).filter(DBUsuario.email == user.email).first():
        raise HTTPException(status_code=400, detail="E-mail já cadastrado.")
    
    novo_user = DBUsuario(
        nome=user.nome, email=user.email,
        senha_hash=pwd_context.hash(user.senha),
        cpf=user.cpf, telefone=user.telefone,
        data_nascimento=user.data_nascimento
    )
    db.add(novo_user)
    db.commit()
    return {"status": "sucesso"}

@app.post("/api/usuarios/login")
def login(cred: UsuarioLogin, db: Session = Depends(get_db)):
    user = db.query(DBUsuario).filter(DBUsuario.email == cred.email).first()
    if not user or not pwd_context.verify(cred.senha, user.senha_hash):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    return {"id": user.id, "nome": user.nome, "email": user.email}

# --- ITENS ---
@app.get("/api/itens")
def listar_itens(db: Session = Depends(get_db)):
    return db.query(DBItem).all()

@app.post("/api/itens")
def criar_item(item: ItemCreate, db: Session = Depends(get_db)):
    db_item = DBItem(**item.dict())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item