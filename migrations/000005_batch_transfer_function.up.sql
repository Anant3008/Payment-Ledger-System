CREATE OR REPLACE FUNCTION process_transfer_batch(
    p_from_wallet_ids INT[],
    p_to_wallet_ids INT[],
    p_amounts BIGINT[]
) RETURNS VOID AS $$
DECLARE
    v_batch_size INT;
    v_locked_ids INT[];
    i INT;
    v_from_id INT;
    v_to_id INT;
    v_amount BIGINT;
    v_sender_balance BIGINT;
    v_tx_id INT;
BEGIN
    v_batch_size := array_length(p_from_wallet_ids, 1);
    IF v_batch_size IS NULL THEN
        RETURN;
    END IF;

    -- 1. Deterministic Multi-Row Locking to prevent deadlocks
    -- We must lock all unique wallet IDs involved in this batch, ordered numerically.
    SELECT ARRAY(
        SELECT DISTINCT unnest_ids
        FROM (
            SELECT unnest(p_from_wallet_ids) AS unnest_ids
            UNION
            SELECT unnest(p_to_wallet_ids)
        ) sub
        ORDER BY unnest_ids
    ) INTO v_locked_ids;

    -- Lock the rows
    -- ORDER BY is crucial here because ANY() does not guarantee lock acquisition order
    FOR i IN 1..array_length(v_locked_ids, 1) LOOP
        PERFORM id FROM wallets WHERE id = v_locked_ids[i] FOR UPDATE;
    END LOOP;

    -- 2. Process each transfer in the batch
    FOR i IN 1..v_batch_size LOOP
        v_from_id := p_from_wallet_ids[i];
        v_to_id := p_to_wallet_ids[i];
        v_amount := p_amounts[i];

        -- Basic validation
        IF v_from_id = v_to_id THEN
            RAISE EXCEPTION 'cannot transfer to self' USING ERRCODE = '22023';
        END IF;

        IF v_amount <= 0 THEN
            RAISE EXCEPTION 'amount must be greater than zero' USING ERRCODE = '22023';
        END IF;

        -- Check sender balance
        SELECT balance INTO v_sender_balance FROM wallets WHERE id = v_from_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'wallet %: resource not found', v_from_id USING ERRCODE = 'P0002';
        END IF;

        -- Check receiver exists
        IF NOT EXISTS (SELECT 1 FROM wallets WHERE id = v_to_id) THEN
            RAISE EXCEPTION 'wallet %: resource not found', v_to_id USING ERRCODE = 'P0002';
        END IF;

        IF v_sender_balance < v_amount THEN
            RAISE EXCEPTION 'sender balance % < amount %: insufficient funds for transfer', v_sender_balance, v_amount USING ERRCODE = 'P0001';
        END IF;

        -- Update balances
        UPDATE wallets SET balance = balance - v_amount WHERE id = v_from_id;
        UPDATE wallets SET balance = balance + v_amount WHERE id = v_to_id;

        -- Insert transaction
        INSERT INTO transactions (wallet_id, amount, type, status)
        VALUES (v_from_id, v_amount, 'transfer', 'completed')
        RETURNING id INTO v_tx_id;

        -- Insert ledger entries
        INSERT INTO ledger_entries (transaction_id, wallet_id, amount)
        VALUES (v_tx_id, v_from_id, -v_amount), (v_tx_id, v_to_id, v_amount);
    END LOOP;

    RETURN;
END;
$$ LANGUAGE plpgsql;
