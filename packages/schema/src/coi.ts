/** Conflict-of-interest fields — required on providers / offerings in public feeds. */

export type EditorialRankInfluence = "none";

export type CommercialRelationship = {
  sponsored: boolean;
  affiliate: boolean;
  editorial_rank_influence: EditorialRankInfluence;
  disclosure?: string;
  disclosure_url?: string;
  as_of?: string;
};
