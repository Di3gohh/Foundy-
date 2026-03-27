from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

# --- CONFIGURAÇÃO DO BANCO ---
SQLALCHEMY_DATABASE_URL = "sqlite:///./foundy.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- MODELOS DE BANCO DE DADOS (SQLAlchemy) ---
class DBItem(Base):
    __tablename__ = "itens"
    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String)
    categoria = Column(String)
    foto = Column(String, nullable=True)
    pergunta = Column(String)
    lat = Column(Float)
    lng = Column(Float)
    user_id = Column(String)
    usuario_nome = Column(String)
    owner_email = Column(String)
    created_at = Column(DateTime, default=datetime.now)

class DBChat(Base):
    __tablename__ = "chats"
    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("itens.id"))
    dono_id = Column(String)
    requisitante_id = Column(String)
    status = Column(String, default="pendente") # pendente, aprovado
    resposta_seguranca = Column(String)

class DBMessage(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(Integer, ForeignKey("chats.id"))
    sender_id = Column(String)
    texto = Column(String)
    timestamp = Column(DateTime, default=datetime.now)

Base.metadata.create_all(bind=engine)

# --- SCHEMAS DE VALIDAÇÃO (Pydantic) ---
class ItemCreate(BaseModel):
    titulo: str
    categoria: str
    lat: float
    lng: float
    pergunta: str
    foto: Optional[str] = None
    user_id: str
    usuario_nome: str
    owner_email: str

class ItemResponse(ItemCreate):
    id: int
    created_at: datetime
    class Config: 
        from_attributes = True

class ChatRequest(BaseModel):
    item_id: int
    requisitante_id: str
    resposta_seguranca: str

class MessageCreate(BaseModel):
    chat_id: int
    sender_id: str
    texto: str

# --- API APP ---
app = FastAPI(title="Foundy API")

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

# --- ENDPOINTS ---

@app.get("/api/itens", response_model=List[ItemResponse])
def listar_itens(db: Session = Depends(get_db)):
    return db.query(DBItem).order_by(DBItem.created_at.desc()).all()

@app.post("/api/itens", response_model=ItemResponse, status_code=201)
def criar_item(item: ItemCreate, db: Session = Depends(get_db)):
    # Validação de Geofencing (Brasil aprox)
    if not (-33.0 < item.lat < 5.0 and -74.0 < item.lng < -34.0):
        raise HTTPException(status_code=400, detail="Localização fora da área permitida.")
    
    db_item = DBItem(**item.model_dump())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

@app.post("/api/chats/solicitar")
def solicitar_chat(req: ChatRequest, db: Session = Depends(get_db)):
    item = db.query(DBItem).filter(DBItem.id == req.item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Item não encontrado")
    
    novo_chat = DBChat(
        item_id=req.item_id, 
        dono_id=item.user_id, 
        requisitante_id=req.requisitante_id,
        resposta_seguranca=req.resposta_seguranca
    )
    db.add(novo_chat)
    db.commit()
    return {"status": "enviado", "chat_id": novo_chat.id}

@app.post("/api/chats/aceitar/{chat_id}")
def aceitar_chat(chat_id: int, db: Session = Depends(get_db)):
    chat = db.query(DBChat).filter(DBChat.id == chat_id).first()
    if not chat: raise HTTPException(status_code=404, detail="Chat não encontrado")
    chat.status = "aprovado"
    db.commit()
    return {"status": "aprovado"}

@app.get("/api/chats/ativos/{user_id}")
def listar_chats_ativos(user_id: str, db: Session = Depends(get_db)):
    return db.query(DBChat).filter(
        ((DBChat.dono_id == user_id) | (DBChat.requisitante_id == user_id)),
        DBChat.status == "aprovado"
    ).all()

@app.post("/api/messages")
def enviar_mensagem(msg: MessageCreate, db: Session = Depends(get_db)):
    db_msg = DBMessage(**msg.model_dump())
    db.add(db_msg)
    db.commit()
    return {"status": "enviada"}