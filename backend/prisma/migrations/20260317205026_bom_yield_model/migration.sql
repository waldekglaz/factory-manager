/*
  Warnings:

  - You are about to drop the column `quantityRequired` on the `ProductPart` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProductPart" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "partId" INTEGER NOT NULL,
    "materialQty" INTEGER NOT NULL DEFAULT 1,
    "productsPerBatch" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "ProductPart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductPart_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ProductPart" ("id", "partId", "productId") SELECT "id", "partId", "productId" FROM "ProductPart";
DROP TABLE "ProductPart";
ALTER TABLE "new_ProductPart" RENAME TO "ProductPart";
CREATE UNIQUE INDEX "ProductPart_productId_partId_key" ON "ProductPart"("productId", "partId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
