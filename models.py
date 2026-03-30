# ==========================================
# models.py
# ==========================================
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class ItemBase(BaseModel):
    titulo: str = Field(..., min_length=3, description="Título do item")
    categoria: str
    lat: float
    lng: float
    pergunta: str = Field(..., description="Pergunta de segurança")
    foto: Optional[str] = None

class ItemCreate(ItemBase):
    user_id: str
    usuario_nome: str

class ItemResponse(ItemBase):
    id: int
    user_id: str
    usuario_nome: str
    created_at: datetime

    class Config:
        from_attributes = True

class NotificationResponse(BaseModel):
    id: int
    sender_name: str
    message: str
    item_id: int
    status: str
    
    class Config:
        from_attributes = True

class NotificationAction(BaseModel):
    notification_id: int
    action: str  # "accepted" ou "rejected"

# ==========================================
# database.py
# ==========================================
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./foundy.db"

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class DBItem(Base):
    __tablename__ = "itens"

    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String, index=True)
    categoria = Column(String)
    foto = Column(String, nullable=True)
    pergunta = Column(String)
    lat = Column(Float)
    lng = Column(Float)
    user_id = Column(String)
    usuario_nome = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

class DBNotification(Base):
    __tablename__ = "notifications"
    
    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(String)
    sender_name = Column(String)
    receiver_id = Column(String)
    item_id = Column(Integer, ForeignKey("itens.id"))
    message = Column(String)
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)

class DBChat(Base):
    __tablename__ = "chats"
    
    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("itens.id"))
    dono_id = Column(String)
    requisitante_id = Column(String)
    status = Column(String, default="pendente")
    created_at = Column(DateTime, default=datetime.utcnow)

# Criação das tabelas
Base.metadata.create_all(bind=engine)

# ==========================================
# repository.py
# ==========================================
from sqlalchemy.orm import Session

def get_items(db: Session):
    return db.query(DBItem).order_by(DBItem.created_at.desc()).all()

def create_item(db: Session, item: ItemCreate):
    db_item = DBItem(**item.model_dump())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

# ==========================================
# services.py
# ==========================================
from fastapi import HTTPException
import cv2
import numpy as np
import pytesseract
import base64

def buscar_todos_itens(db: Session):
    itens = get_items(db)
    return itens if itens else []

def registrar_novo_item(item_data: ItemCreate, db: Session):
    # Validação de Geofencing para o Brasil
    if not (-33.0 < item_data.lat < 5.0 and -74.0 < item_data.lng < -34.0):
        raise HTTPException(status_code=400, detail="Localização fora da área de cobertura.")
    
    # Se houver foto, aplica a censura antes de salvar
    if item_data.foto and "base64" in item_data.foto:
        foto_censurada, detectado = censurar_documentos(item_data.foto)
        item_data.foto = foto_censurada
        
    return create_item(db, item_data)

def censurar_documentos(base64_image):
    try:
        encoded_data = base64_image.split(',')[1]
        nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        d = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        documento_detectado = False
        
        for i in range(len(d['text'])):
            # Detecta sequências numéricas suspeitas de documentos
            if len(d['text'][i]) > 7 and any(c.isdigit() for c in d['text'][i]):
                documento_detectado = True
                (x, y, w_box, h_box) = (d['left'][i], d['top'][i], d['width'][i], d['height'][i])
                roi = img[y:y+h_box, x:x+w_box]
                roi = cv2.GaussianBlur(roi, (23, 23), 30)
                img[y:y+h_box, x:x+w_box] = roi

        _, buffer = cv2.imencode('.jpg', img)
        img_as_text = base64.b64encode(buffer).decode('utf-8')
        return f"data:image/jpeg;base64,{img_as_text}", documento_detectado
    except Exception:
        return base64_image, False

# ==========================================
# main.py
# ==========================================
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List

app = FastAPI(title="Foundy API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/api/itens", response_model=List[ItemResponse])
def listar_itens(db: Session = Depends(get_db)):
    return buscar_todos_itens(db)

@app.post("/api/itens", response_model=ItemResponse, status_code=201)
def criar_item(item: ItemCreate, db: Session = Depends(get_db)):
    return registrar_novo_item(item, db)  

@app.get("/api/notifications/{user_id}", response_model=List[NotificationResponse])
def get_notifications(user_id: str, db: Session = Depends(get_db)):
    return db.query(DBNotification).filter(
        DBNotification.receiver_id == user_id, 
        DBNotification.status == "pending"
    ).all()

@app.post("/api/notifications/respond")
def respond_notification(req: NotificationAction, db: Session = Depends(get_db)):
    notif = db.query(DBNotification).filter(DBNotification.id == req.notification_id).first()
    if not notif: 
        raise HTTPException(status_code=404, detail="Notificação não encontrada")
    
    notif.status = req.action
    if req.action == "accepted":
        novo_chat = DBChat(
            item_id=notif.item_id,
            dono_id=notif.receiver_id,
            requisitante_id=notif.sender_id,
            status="aprovado"
        )
        db.add(novo_chat)
    
    db.commit()
    return {"status": "success"}