-- CreateEnum
CREATE TYPE "ConversationState" AS ENUM ('NO_REPLY', 'REPLIED', 'ACTIVE', 'STOPPED');

-- AlterTable
ALTER TABLE "PersonCompanyAssociation" ADD COLUMN     "conversation_state" "ConversationState" NOT NULL DEFAULT 'NO_REPLY';
