In FastAPI, a Controller → Service → Repository → Database structure separates HTTP handling, business logic, database operations, and storage.

Let's build a simple Product CRUD API using FastAPI + PostgreSQL + SQLAlchemy + Pydantic, with the controller and service layers clearly separated.

## 1. Project structure

```
app/
├── main.py
├── database.py
├── models.py
├── schemas.py
├── repositories/
│   └── product_repository.py
├── services/
│   └── product_service.py
└── controllers/
    └── product_controller.py
```

Controller — FastAPI Router

Receives HTTP requests and returns HTTP responses

Service — Business Logic

Validates business rules and coordinates operations

Repository — Database Operations

Queries, inserts, updates and deletes using SQLAlchemy

PostgreSQL

Stores product records permanently

## 2. Database connection — `database.py`

```
from sqlalchemy import create_enginefrom sqlalchemy.orm import sessionmaker, DeclarativeBaseDATABASE_URL = (    "postgresql+psycopg://postgres:password@localhost:5432/shop")engine = create_engine(DATABASE_URL)SessionLocal = sessionmaker(    bind=engine,    autoflush=False,    autocommit=False,)class Base(DeclarativeBase):    passdef get_db():    db = SessionLocal()    try:        yield db    finally:        db.close()
```

`get_db()` provides a database session to each request and closes it afterward. Replace the example credentials with your own, preferably using environment variables.

## 3. SQLAlchemy model — `models.py`

This defines how a product is stored in PostgreSQL.

```
from sqlalchemy import String, Float, Integerfrom sqlalchemy.orm import Mapped, mapped_columnfrom app.database import Baseclass Product(Base):    __tablename__ = "products"    id: Mapped[int] = mapped_column(        Integer, primary_key=True, index=True    )    name: Mapped[str] = mapped_column(String(100), nullable=False)    description: Mapped[str | None] = mapped_column(        String(500), nullable=True    )    price: Mapped[float] = mapped_column(Float, nullable=False)    stock: Mapped[int] = mapped_column(Integer, default=0)
```

## 4. Pydantic schemas — `schemas.py`

Schemas define what clients can send and what the API returns. They are different from SQLAlchemy models, which define database tables.

```
from pydantic import BaseModel, ConfigDict, Fieldclass ProductCreate(BaseModel):    name: str = Field(min_length=1, max_length=100)    description: str | None = None    price: float = Field(gt=0)    stock: int = Field(ge=0)class ProductUpdate(BaseModel):    name: str | None = Field(default=None, max_length=100)    description: str | None = None    price: float | None = Field(default=None, gt=0)    stock: int | None = Field(default=None, ge=0)class ProductResponse(BaseModel):    id: int    name: str    description: str | None    price: float    stock: int    model_config = ConfigDict(from_attributes=True)
```

- `ProductCreate`: incoming request data.
    
- `ProductUpdate`: fields that can be changed.
    
- `ProductResponse`: outgoing API data, including the database-generated ID.
    
- Pydantic validates incoming values and converts SQLAlchemy objects into response data.
    

## 5. Repository — `repositories/product_repository.py`

The repository handles database queries. It does not decide business rules or HTTP status codes.

```
from sqlalchemy.orm import Sessionfrom app.models import Productfrom app.schemas import ProductCreate, ProductUpdatedef get_all(db: Session):    return db.query(Product).all()def get_by_id(db: Session, product_id: int):    return db.query(Product).filter(        Product.id == product_id    ).first()def create(db: Session, data: ProductCreate):    product = Product(**data.model_dump())    db.add(product)    db.commit()    db.refresh(product)    return productdef update(    db: Session,    product: Product,    data: ProductUpdate,):    changes = data.model_dump(exclude_unset=True)    for field, value in changes.items():        setattr(product, field, value)
```

The repository uses SQLAlchemy's session to communicate with PostgreSQL.

## 6. Service — `services/product_service.py`

This is the business logic layer. It decides what should happen when the controller requests an operation.

```
from fastapi import HTTPException, statusfrom sqlalchemy.orm import Sessionfrom app.schemas import ProductCreate, ProductUpdatefrom app.repositories import product_repository as repodef get_products(db: Session):    return repo.get_all(db)def get_product(db: Session, product_id: int):    product = repo.get_by_id(db, product_id)    if product is None:        raise HTTPException(            status_code=status.HTTP_404_NOT_FOUND,            detail="Product not found",        )    return productdef create_product(db: Session, data: ProductCreate):    return repo.create(db, data)def update_product(    db: Session,    product_id: int,    data: ProductUpdate,):    product = get_product(db, product_id)    return repo.update(db, product, data)
```

Notice the difference:

- The repository knows how to query the database.
    
- The service knows what the application should do.
    

For example, the service checks whether a product exists before updating or deleting it. You can add rules here, such as preventing deletion of products that have active orders.

## 7. Controller — `controllers/product_controller.py`

The controller defines the API endpoints and connects HTTP requests to service functions.

```
from fastapi import APIRouter, Depends, statusfrom sqlalchemy.orm import Sessionfrom app.database import get_dbfrom app.schemas import ProductCreate, ProductUpdate, ProductResponsefrom app.services import product_service as servicerouter = APIRouter(    prefix="/products",    tags=["Products"],)@router.get("/", response_model=list[ProductResponse])def list_products(db: Session = Depends(get_db)):    return service.get_products(db)@router.get("/{product_id}", response_model=ProductResponse)def get_product(    product_id: int,    db: Session = Depends(get_db),):    return service.get_product(db, product_id)@router.post(    "/",    response_model=ProductResponse,    status_code=status.HTTP_201_CREATED,)def create_product(    data: ProductCreate,    db: Session = Depends(get_db),):    return service.create_product(db, data)
```

The controller is deliberately thin. It receives the request, obtains the database session through dependency injection, calls the service, and declares the response format.

## 8. Application entry point — `main.py`

```
from fastapi import FastAPIfrom app.database import Base, enginefrom app.controllers.product_controller import routerBase.metadata.create_all(bind=engine)app = FastAPI(title="Product CRUD API")app.include_router(router)
```

`create_all()` creates missing tables for this learning example. For a production application, use database migrations such as Alembic.

## 9. Install and run

```
pip install fastapi "uvicorn[standard]" \
  sqlalchemy "psycopg[binary]" pydantic
```

Create a PostgreSQL database named `shop`, configure your connection URL, and run from the directory containing `app/`:

```
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/docs` to test all five CRUD endpoints interactively.

## 10. Follow one request through the layers

Suppose the client sends this request:

```
POST /products/
Content-Type: application/json
```

```
{
  "name": "Keyboard",
  "description": "Mechanical keyboard",
  "price": 75.0,
  "stock": 10
}
```

The request flow is:

1. Controller: receives the JSON request and FastAPI validates it using `ProductCreate`.
    
2. Service: `create_product()` coordinates the creation operation and can enforce business rules.
    
3. Repository: constructs a SQLAlchemy `Product`, inserts it, commits the transaction and retrieves its generated ID.
    
4. PostgreSQL: stores the product row.
    
5. Controller response: FastAPI serializes the returned object using `ProductResponse` and returns HTTP `201 Created`.
    

The response will look like this:

```
{
  "id": 1,
  "name": "Keyboard",
  "description": "Mechanical keyboard",
  "price": 75.0,
  "stock": 10
}
```

The ID is illustrative; PostgreSQL generates the actual value.

The key concept: the controller should not contain SQL queries, the repository should not handle HTTP requests, and the service should not need to know how the request arrived. This separation makes the application easier to test, maintain, and extend.

----
model.py
```
from sqlalchemy import String, Float, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    price: Mapped[float] = mapped_column(Float, nullable=False)
    stock: Mapped[int] = mapped_column(Integer, default=0)
```

---
schemas.py
```
from pydantic import BaseModel, ConfigDict, Field


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = None
    price: float = Field(gt=0)
    stock: int = Field(ge=0)


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    description: str | None = None
    price: float | None = Field(default=None, gt=0)
    stock: int | None = Field(default=None, ge=0)


class ProductResponse(BaseModel):
    id: int
    name: str
    description: str | None
    price: float
    stock: int

    model_config = ConfigDict(from_attributes=True)
```

---
repositories.py
```
from sqlalchemy.orm import Session

from app.models import Product
from app.schemas import ProductCreate, ProductUpdate


def get_all(db: Session):
    return db.query(Product).all()


def get_by_id(db: Session, product_id: int):
    return db.query(Product).filter(
        Product.id == product_id
    ).first()


def create(db: Session, data: ProductCreate):
    product = Product(**data.model_dump())

    db.add(product)
    db.commit()
    db.refresh(product)

    return product


def update(
    db: Session,
    product: Product,
    data: ProductUpdate,
):
    changes = data.model_dump(exclude_unset=True)

    for field, value in changes.items():
        setattr(product, field, value)

    db.commit()
    db.refresh(product)

    return product


def delete(db: Session, product: Product):
    db.delete(product)
    db.commit()
```

---
productservice.py
```
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.schemas import ProductCreate, ProductUpdate
from app.repositories import product_repository as repo


def get_products(db: Session):
    return repo.get_all(db)


def get_product(db: Session, product_id: int):
    product = repo.get_by_id(db, product_id)

    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )

    return product


def create_product(db: Session, data: ProductCreate):
    return repo.create(db, data)


def update_product(
    db: Session,
    product_id: int,
    data: ProductUpdate,
):
    product = get_product(db, product_id)
    return repo.update(db, product, data)


def delete_product(db: Session, product_id: int):
    product = get_product(db, product_id)
    repo.delete(db, product)
```

---
controller.py
```
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import ProductCreate, ProductUpdate, ProductResponse
from app.services import product_service as service

router = APIRouter(
    prefix="/products",
    tags=["Products"],
)


@router.get("/", response_model=list[ProductResponse])
def list_products(db: Session = Depends(get_db)):
    return service.get_products(db)


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
):
    return service.get_product(db, product_id)


@router.post(
    "/",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_product(
    data: ProductCreate,
    db: Session = Depends(get_db),
):
    return service.create_product(db, data)


@router.put("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: int,
    data: ProductUpdate,
    db: Session = Depends(get_db),
):
    return service.update_product(db, product_id, data)


@router.delete(
    "/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
):
    service.delete_product(db, product_id)
```

---
main.py
```
from fastapi import FastAPI

from app.database import Base, engine
from app.controllers.product_controller import router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Product CRUD API")

app.include_router(router)
```


----ss
depends dependcy injection
