CREATE OR REPLACE FUNCTION process_transfer(
    p_from_wallet_id INT,
    p_to_wallet_id INT,
    p_amount BIGINT
) RETURNS INT AS $$
DECLARE
    v_first_id INT;
    v_second_id INT;
    v_sender_balance BIGINT;
    v_dummy INT;
    v_tx_id INT;
BEGIN
    -- Reject invalid transfers
    IF p_from_wallet_id = p_to_wallet_id THEN
        RAISE EXCEPTION 'cannot transfer to self' USING ERRCODE = '22023';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'amount must be greater than zero' USING ERRCODE = '22023';
    END IF;

    -- Deterministic lock ordering to strictly prevent deadlocks
    IF p_from_wallet_id < p_to_wallet_id THEN
        v_first_id := p_from_wallet_id;
        v_second_id := p_to_wallet_id;
    ELSE
        v_first_id := p_to_wallet_id;
        v_second_id := p_from_wallet_id;
    END IF;

    -- Lock both wallets in deterministic order
    SELECT id INTO v_dummy FROM wallets WHERE id = v_first_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'wallet %: resource not found', v_first_id USING ERRCODE = 'P0002';
    END IF;

    SELECT id INTO v_dummy FROM wallets WHERE id = v_second_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'wallet %: resource not found', v_second_id USING ERRCODE = 'P0002';
    END IF;

    -- Check sender balance
    SELECT balance INTO v_sender_balance FROM wallets WHERE id = p_from_wallet_id;
    IF v_sender_balance < p_amount THEN
        RAISE EXCEPTION 'sender balance % < amount %: insufficient funds for transfer', v_sender_balance, p_amount USING ERRCODE = 'P0001';
    END IF;

    -- Update balances
    UPDATE wallets SET balance = balance - p_amount WHERE id = p_from_wallet_id;
    UPDATE wallets SET balance = balance + p_amount WHERE id = p_to_wallet_id;

    -- Record transaction
    INSERT INTO transactions (wallet_id, amount, type, status)
    VALUES (p_from_wallet_id, p_amount, 'transfer', 'completed')
    RETURNING id INTO v_tx_id;

    -- Record double-entry ledger entries
    INSERT INTO ledger_entries (transaction_id, wallet_id, amount)
    VALUES (v_tx_id, p_from_wallet_id, -p_amount), (v_tx_id, p_to_wallet_id, p_amount);

    RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql;
