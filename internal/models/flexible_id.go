package models

import (
	"encoding/json"
	"strconv"
)

// FlexibleID is an int that can unmarshal from either a JSON integer (123) or a JSON string ("123").
type FlexibleID int

func (f *FlexibleID) UnmarshalJSON(data []byte) error {
	var i int
	if err := json.Unmarshal(data, &i); err == nil {
		*f = FlexibleID(i)
		return nil
	}
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return err
	}
	if s == "" {
		*f = 0
		return nil
	}
	val, err := strconv.Atoi(s)
	if err != nil {
		return err
	}
	*f = FlexibleID(val)
	return nil
}

func (f FlexibleID) Int() int {
	return int(f)
}
