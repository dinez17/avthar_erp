-- RenameIndex
ALTER INDEX "number_sequences_key" RENAME TO "number_sequences_documentType_scope_financialYear_key";

-- RenameIndex
ALTER INDEX "number_series_settings_key" RENAME TO "number_series_settings_documentType_branchId_key";
