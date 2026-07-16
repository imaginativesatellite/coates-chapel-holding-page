-- Audit log of every time a quote was emailed to the end client (from the
-- Presentation-Mode checkbox at quote time, or later from the client-facing
-- re-send list). toEmail records the address it actually went to, which may be
-- a one-off override that differs from the client's saved contact email.

-- CreateTable
CREATE TABLE "QuoteEmailSend" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "sentById" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteEmailSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteEmailSend_quoteId_idx" ON "QuoteEmailSend"("quoteId");

-- AddForeignKey
ALTER TABLE "QuoteEmailSend" ADD CONSTRAINT "QuoteEmailSend_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteEmailSend" ADD CONSTRAINT "QuoteEmailSend_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
