from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import cv2
import numpy as np
import pytesseract
import base64
import uvicorn

# ==========================================
# CONFIGURAÇÃO E DATABASE
# ==========================================
# Certifique-se de que o caminho abaixo aponta para o EXECUTÁVEL tesseract.exe
pytesseract.pytesseract.tesseract_cmd = r'C:\Users\Pichau\Downloads\tesseract-5.5.2\tesseract.exe'

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

Base.metadata.create_all(bind=engine)

# ==========================================
# MODELS (PYDANTIC)
# ==========================================
class ItemBase(BaseModel):
    titulo: str = Field(..., min_length=3)
    categoria: str
    lat: float
    lng: float
    pergunta: str
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

class NotificationCreate(BaseModel):
    item_id: int
    owner_id: str
    requester_id: str
    requester_name: str
    answer: str

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
    action: str 

# ==========================================
# UTILITÁRIOS / SERVIÇOS
# ==========================================
def censurar_documentos(base64_image: str):
    try:
        if not base64_image or "," not in base64_image:
            return base64_image, False
            
        header, encoded = base64_image.split(",", 1)
        nparr = np.frombuffer(base64.b64decode(encoded), np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return base64_image, False

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        d = pytesseract.image_to_data(gray, output_type=pytesseract.Output.DICT)
        detectado = False

        for i in range(len(d['text'])):
            text = d['text'][i].strip()
            if len(text) > 7 and any(c.isdigit() for c in text):
                detectado = True
                x, y, w, h = d['left'][i], d['top'][i], d['width'][i], d['height'][i]
                if w > 0 and h > 0:
                    sub_face = img[y:y+h, x:x+w]
                    sub_face = cv2.GaussianBlur(sub_face, (23, 23), 30)
                    img[y:y+h, x:x+w] = sub_face

        _, buffer = cv2.imencode('.jpg', img)
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        return f"{header},{img_base64}", detectado
    except Exception as e:
        print(f"Erro no OCR: {e}")
        return base64_image, False

# ==========================================
# APP E ROTAS
# ==========================================
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

# --- ROTAS DE ITENS ---
@app.get("/api/itens", response_model=List[ItemResponse])
def listar_itens(db: Session = Depends(get_db)):
    return db.query(DBItem).order_by(DBItem.created_at.desc()).all()

@app.post("/api/itens", response_model=ItemResponse, status_code=201)
def criar_item_rota(item: ItemCreate, db: Session = Depends(get_db)):
    # Geofencing Brasil
    if not (-34.0 <= item.lat <= 6.0 and -75.0 <= item.lng <= -34.0):
        raise HTTPException(status_code=400, detail="Localização fora do Brasil.")

    final_foto = item.foto
    if item.foto and "base64" in item.foto:
        final_foto, _ = censurar_documentos(item.foto)

    db_item = DBItem(**item.dict(exclude={'foto'}), foto=final_foto)
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

# --- ROTAS DE NOTIFICAÇÕES ---
@app.post("/api/notifications")
async def create_notification(notif: NotificationCreate, db: Session = Depends(get_db)):
    # Verifica se o item existe
    item = db.query(DBItem).filter(DBItem.id == notif.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado")

    new_notif = DBNotification(
        sender_id=notif.requester_id,
        sender_name=notif.requester_name,
        receiver_id=notif.owner_id,
        item_id=notif.item_id,
        message=notif.answer,
        status="pending"
    )
    db.add(new_notif)
    db.commit()
    return {"status": "sent"}

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

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)