# ==========================================
# models.py
# ==========================================
from pydantic import BaseModel, Field
from typing import Optional
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

# ==========================================
# database.py
# ==========================================
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
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

Base.metadata.create_all(bind=engine)

# ==========================================
# repository.py
# ==========================================
from sqlalchemy.orm import Session
from database import DBItem
import models

def get_items(db: Session):
    return db.query(DBItem).order_by(DBItem.created_at.desc()).all()

def create_item(db: Session, item: models.ItemCreate):
    db_item = DBItem(**item.model_dump())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

# ==========================================
# services.py
# ==========================================
from sqlalchemy.orm import Session
from fastapi import HTTPException
import repository
import models

def buscar_todos_itens(db: Session):
    itens = repository.get_items(db)
    if not itens:
        return []
    return itens

def registrar_novo_item(item_data: models.ItemCreate, db: Session):
    if not (-33.0 < item_data.lat < 5.0 and -74.0 < item_data.lng < -34.0):
        raise HTTPException(status_code=400, detail="Localização fora da área de cobertura.")
    return repository.create_item(db, item_data)

# ==========================================
# main.py
# ==========================================
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List

import models
import services
from database import SessionLocal

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

@app.get("/api/itens", response_model=List[models.ItemResponse])
def listar_itens(db: Session = Depends(get_db)):
    return services.buscar_todos_itens(db)

@app.post("/api/itens", response_model=models.ItemResponse, status_code=201)
def criar_item(item: models.ItemCreate, db: Session = Depends(get_db)):
    return services.registrar_novo_item(item, db)